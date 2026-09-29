const { SlashCommandBuilder } = require('discord.js');
const {
    fetchMinecraftStatus,
    formatMinecraftStatus,
    foxcraftEmbed,
    getServerValues,
} = require('../utils/foxcraft');
const { publicReply } = require('../utils/interaction');
const { t } = require('../utils/lang');

async function statusEmbed(guildId) {
    const { ip, version } = getServerValues();
    try {
        const status = await fetchMinecraftStatus(ip);
    const result = formatMinecraftStatus(status, version);
    return foxcraftEmbed(result.title, result.description, result.fields || []);
    } catch (error) {
        console.error('[FOXCRAFT] Minecraft status could not be checked:', error.message);
        return foxcraftEmbed(t(guildId, 'server_status_title'), t(guildId, 'server_status_unavailable'));
    }
}

module.exports = {
    data: new SlashCommandBuilder().setName('server').setDescription('Shows the FoxCraft Minecraft server status'),
    async execute() {
        return publicReply(null, [await statusEmbed(interaction.guild_id)]);
    },
    prefixExecute: async (message) => message.reply({ embeds: [await statusEmbed(message.guild?.id)] }),
};
