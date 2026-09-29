/**
 * AFK system. Members set an AFK reason with /afk (or !afk). When they send
 * any message, AFK is cleared automatically. When someone mentions an AFK
 * user, the bot announces "X is AFK".
 */

const { getModules, getAfk } = require('./db');
const { deleteLater } = require('./foxcraft');
const { t } = require('./lang');

/**
 * Runs AFK checks for a message. Returns true when the message should not be
 * processed further by word/number games (AFK mention announcement is a reply).
 */
async function handleMessage(message) {
    if (!message.guild || message.author.bot) return false;
    if (message.content?.startsWith('!')) return false;
    const config = getModules(message.guild.id).afk;
    if (!config || config.enabled !== true) return false;

    try {
        const self = getAfk(message.guild.id, message.author.id);
        if (self) {
            const { clearAfk } = require('./db');
            clearAfk(message.guild.id, message.author.id);
            const notify = await message.reply(t(message.guild?.id, 'afk_cleared', { user: `${message.author}` })).catch(() => null);
            deleteLater(notify, 5000);
            return false;
        }
    } catch {
        /* ignore */
    }

    const mentions = message.mentions?.users || new Map();
    const targetId = mentions.first?.()?.id
        || (message.content.match(/<@!?(\d+)>/)?.[1] || null);
    if (!targetId) return false;

    const afk = getAfk(message.guild.id, targetId);
    if (!afk) return false;

    const ago = Math.max(1, Math.round((Date.now() - afk.since) / 60000));
    const part = afk.reason ? `${t(message.guild?.id, 'afk_reason')}: *${afk.reason}*` : t(message.guild?.id, 'mod_no_reason');
    const mention = `<@${targetId}>`;
    await message.channel.send(t(message.guild?.id, 'afk_notice', { user: mention, minutes: ago, part }))
        .then((m) => deleteLater(m, 8000))
        .catch(() => {});
    return false;
}

module.exports = { handleMessage };