/**
 * Sayma (counting) system for channels configured via /sayma or the panel.
 * Users must count 1, 2, 3 ... in order and the same user cannot write twice
 * in a row. A wrong number keeps the current count and deletes the message.
 */

const { getModules, getGuildData, updateGuildData } = require('./db');
const { deleteLater } = require('./foxcraft');

const CHECK_EMOJI_NAME = 'foxcraft_check';

function stateKey(member) {
    return `${member}-state`;
}

function getState(guildId, channelId, today) {
    const data = getGuildData(guildId);
    const state = data.saymaState?.[channelId] || { expected: 1, lastUser: null, counts: {}, day: today };
    if (state.day !== today) {
        state.expected = 1;
        state.lastUser = null;
        state.counts = {};
        state.day = today;
    }
    return state;
}

function saveState(guildId, channelId, state) {
    const data = getGuildData(guildId);
    updateGuildData(guildId, { saymaState: { ...(data.saymaState || {}), [channelId]: state } });
}

function isCountingChannel(message) {
    const chat = message.channel;
    if (!chat) return false;
    const config = getModules(message.guild.id).sayma;
    if (config?.enabled !== true || !config.channel) return false;
    return chat.id === config.channel;
}

/**
 * Handles a message in a configured counting channel. Returns true when the
 * message belongs to this channel (therefore consumed).
 */
async function handleMessage(message) {
    if (!message.guild || message.author.bot || message.content?.startsWith('!')) return false;
    if (!isCountingChannel(message)) return false;

    const today = new Date().toISOString().slice(0, 10);
    const state = getState(message.guild.id, message.channel.id, today);

    const number = Number(message.content.trim());
    const valid = Number.isInteger(number) && number === state.expected && message.author.id !== state.lastUser;

    if (!valid) {
        await message.delete().catch(() => {});
        const warning = await message.channel.send('Növbəti düzgün rəqəm yazılmalıdır və eyni üzv ardıcıl yaza bilməz.')
            .catch(() => null);
        deleteLater(warning, 4000);
        return true;
    }

    state.expected += 1;
    state.lastUser = message.author.id;
    state.counts[message.author.id] = (state.counts[message.author.id] || 0) + 1;
    saveState(message.guild.id, message.channel.id, state);
    await addCheckReaction(message);
    return true;
}

async function addCheckReaction(message) {
    try {
        let emoji = message.guild?.emojis?.cache?.find((e) => e.name === CHECK_EMOJI_NAME) || '✅';
        if (emoji === '✅') {
            const emojis = await message.guild.emojis.fetch();
            emoji = emojis.find((e) => e.name === CHECK_EMOJI_NAME) || '✅';
        }
        await message.react(emoji);
    } catch {
        /* reaction failed, non-fatal */
    }
}

function getTopCounters(guildId, channelId, limit = 5) {
    const data = getGuildData(guildId);
    const state = data.saymaState?.[channelId];
    if (!state) return [];
    return Object.entries(state.counts || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([userId, count]) => ({ userId, count }));
}

module.exports = { handleMessage, getTopCounters };