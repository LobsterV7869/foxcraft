const { SlashCommandBuilder } = require('discord.js');
const {
    fetchMinecraftStatus,
    formatMinecraftStatus,
    foxcraftEmbed,
    getServerValues,
    COMING_SOON,
} = require('../utils/foxcraft');
const { publicReply } = require('../utils/interaction');
const { t } = require('../utils/lang');

async function statusEmbed(guildId) {
    const { ip, version } = getServerValues();
    if (!ip || ip === COMING_SOON) {
        return foxcraftEmbed(t(guildId, 'status_live_title'), t(guildId, 'status_ip_coming'));
    }
    try {
        const status = await fetchMinecraftStatus(ip);
        const result = formatMinecraftStatus(status, version);
        return foxcraftEmbed(result.title, result.description, result.fields || []);
    } catch (error) {
        console.error('[FOXCRAFT] Live Minecraft status could not be fetched:', error.message);
        return foxcraftEmbed(t(guildId, 'status_live_title'), t(guildId, 'status_unreachable'));
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('status')
        .setDescription('Shows the live status of the FoxCraft Minecraft server'),
    async execute(interaction) {
        return publicReply(null, [await statusEmbed(interaction.guild_id)]);
    },
    prefixExecute: async (message) => message.reply({ embeds: [await statusEmbed(message.guild?.id)] }),
    getStatusEmbed: statusEmbed,
};
