const { SlashCommandBuilder } = require('discord.js');
const {
    fetchMinecraftStatus,
    formatMinecraftStatus,
    foxcraftEmbed,
    getServerValues,
} = require('../utils/foxcraft');
const { publicReply } = require('../utils/interaction');

async function statusEmbed() {
    const { ip, version } = getServerValues();
    try {
        const status = await fetchMinecraftStatus(ip);
    const result = formatMinecraftStatus(status, version);
    return foxcraftEmbed(result.title, result.description, result.fields || []);
    } catch (error) {
        console.error('[FOXCRAFT] Minecraft status yoxlanılmadı:', error.message);
        return foxcraftEmbed('FoxCraft server statusu', 'Status hazırda müəyyən edilə bilmir.');
    }
}

module.exports = {
    data: new SlashCommandBuilder().setName('server').setDescription('FoxCraft Minecraft server statusunu göstərir'),
    async execute() {
        return publicReply(null, [await statusEmbed()]);
    },
    prefixExecute: async (message) => message.reply({ embeds: [await statusEmbed()] }),
};
