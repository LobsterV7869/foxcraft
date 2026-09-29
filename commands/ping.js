const { SlashCommandBuilder } = require('discord.js');
const { publicReply } = require('../utils/interaction');
const { t } = require('../utils/lang');

function snowflakeTimestamp(id) {
    try {
        return Number((BigInt(id) >> 22n) + 1420070400000n);
    } catch {
        return null;
    }
}

function pingText(client, interactionId, startedAt, guildId) {
    const apiLatency = snowflakeTimestamp(interactionId);
    const apiMs = apiLatency ? Math.max(0, startedAt - apiLatency) : null;
    const pending = t(guildId, 'ping_pending');
    const gateway = Number.isFinite(client?.ws?.ping) && client.ws.ping >= 0
        ? `${client.ws.ping} ms`
        : pending;
    return [
        `${t(guildId, 'ping_line_bot')}: \`${Math.max(0, Date.now() - startedAt)} ms\``,
        `${t(guildId, 'ping_line_api')}: \`${apiMs === null ? pending : `${apiMs} ms`}\``,
        `${t(guildId, 'ping_line_gateway')}: \`${gateway}\``,
    ].join('\n');
}

module.exports = {
    data: new SlashCommandBuilder().setName('ping').setDescription('Shows the bot and Discord latency'),
    async execute(interaction) {
        const startedAt = Date.now();
        return publicReply(pingText(interaction.discordClient, interaction.id, startedAt, interaction.guild_id));
    },
    prefixExecute: async (message) => {
        const startedAt = Date.now();
        return message.reply(pingText(message.client, message.id, startedAt, message.guild?.id));
    },
};
