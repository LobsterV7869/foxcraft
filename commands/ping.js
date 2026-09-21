const { SlashCommandBuilder } = require('discord.js');
const { publicReply } = require('../utils/interaction');

function snowflakeTimestamp(id) {
    try {
        return Number((BigInt(id) >> 22n) + 1420070400000n);
    } catch {
        return null;
    }
}

function pingText(client, interactionId, startedAt) {
    const apiLatency = snowflakeTimestamp(interactionId);
    const apiMs = apiLatency ? Math.max(0, startedAt - apiLatency) : null;
    const gatewayMs = Number.isFinite(client?.ws?.ping) && client.ws.ping >= 0
        ? `${client.ws.ping} ms`
        : 'Yaxında';
    return `🏓 **Bot Gecikməsi:** \`${Math.max(0, Date.now() - startedAt)} ms\`\n🌐 **Discord API:** \`${apiMs === null ? 'Yaxında' : `${apiMs} ms`}\`\n⚡ **Gateway:** \`${gatewayMs}\``;
}

module.exports = {
    data: new SlashCommandBuilder().setName('ping').setDescription('Bot və Discord gecikməsini göstərir'),
    async execute(interaction) {
        const startedAt = Date.now();
        return publicReply(pingText(interaction.discordClient, interaction.id, startedAt));
    },
    prefixExecute: async (message) => {
        const startedAt = Date.now();
        return message.reply(pingText(message.client, message.id, startedAt));
    },
};
