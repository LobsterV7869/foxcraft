/**
 * AFK system. Members set an AFK reason with /afk (or !afk). When they send
 * any message, AFK is cleared automatically. When someone mentions an AFK
 * user, the bot announces "X AFK-dır".
 */

const { getModules, getAfk } = require('./db');

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
            const notify = await message.reply(`${message.author} AFK-dan qayıtdı! 🎉`).catch(() => null);
            if (notify) setTimeout(() => notify.delete().catch(() => {}), 5000);
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
    const part = afk.reason ? `Səbəb: *${afk.reason}*` : 'Səbəb göstərilməyib.';
    const mention = `<@${targetId}>`;
    await message.channel.send(`${mention} AFK-dır (${ago} dəqiqədir). ${part}`)
        .then((m) => setTimeout(() => m.delete().catch(() => {}), 8000))
        .catch(() => {});
    return false;
}

module.exports = { handleMessage };