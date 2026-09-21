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
    if (ip === 'Yaxında') {
        return foxcraftEmbed('FoxCraft canlı statusu', 'Server IP-si Yaxında olacaq.');
    }
    try {
        const status = await fetchMinecraftStatus(ip);
        const result = formatMinecraftStatus(status, version);
        return foxcraftEmbed(result.title, result.description, result.fields || []);
    } catch (error) {
        console.error('[FOXCRAFT] Canlı Minecraft statusu alınmadı:', error.message);
        return foxcraftEmbed('FoxCraft canlı statusu', 'Serverə ping göndərmək mümkün olmadı.');
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('status')
        .setDescription('FoxCraft Minecraft serverinin canlı statusunu göstərir'),
    async execute() {
        return publicReply(null, [await statusEmbed()]);
    },
    prefixExecute: async (message) => message.reply({ embeds: [await statusEmbed()] }),
    getStatusEmbed: statusEmbed,
};
