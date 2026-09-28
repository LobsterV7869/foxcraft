/**
 * Moderation action logging. Every moderation command reports its result to
 * the configured mod-log channel (see /setlog and the "{modlog}" panel toggles).
 */

const logger = require('./logger');
const { getModules } = require('./db');
const { foxcraftEmbed } = require('./foxcraft');

const MOD_COLORS = {
    ban: 0xED4245,
    unban: 0x57F287,
    kick: 0xED4245,
    mute: 0xF1C40F,
    unmute: 0x57F287,
    lock: 0x95A5A6,
    unlock: 0x57F287,
    sil: 0x95A5A6,
    slowmode: 0x95A5A6,
    warn: 0xF1C40F,
    timeout: 0xF1C40F,
};

function isModLogEnabled(guildId) {
    return getModules(guildId).modlog.enabled !== false;
}

/**
 * Sends an embed to the guild's mod-log channel. Silently no-ops when the
 * module is disabled, no channel is configured, or the bot lacks permission.
 */
async function logModAction(guild, action, description) {
    if (!guild) return;
    try {
        if (!isModLogEnabled(guild.id)) return;
        const channel = await logger.getLogChannel(guild);
        if (!channel || !channel.isTextBased()) return;
        const emojiMap = { ban: '🔨', unban: '🔓', kick: '👢', mute: '🔇', unmute: '🔊', lock: '🔒', unlock: '🔓', sil: '🧹', slowmode: '🐢', warn: '⚠️', timeout: '⏱️' };
        const title = `${emojiMap[action] || '🛡️'} ${action.toUpperCase()}`;
        await channel.send({
            embeds: [foxcraftEmbed(title, description)],
        }).catch(() => {});
    } catch (error) {
        console.error('[MODLOG] Loq göndərilmədi:', error.message);
    }
}

module.exports = { logModAction, isModLogEnabled, MOD_COLORS };