const { SlashCommandBuilder } = require('discord.js');
const { getServerValues, foxcraftEmbed, discordRequest } = require('../utils/foxcraft');
const { publicReply } = require('../utils/interaction');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('foxcraft-info')
        .setDescription('FoxCraft server məlumatlarını göstərir'),
    async execute(interaction) {
        const { ip, version } = getServerValues();
        let memberCount = 'Yaxında';
        if (interaction.guild_id) {
            try {
                const guild = await discordRequest('GET', `/guilds/${interaction.guild_id}?with_counts=true`);
                memberCount = String(guild.approximate_member_count || guild.member_count || 'Yaxında');
            } catch (error) {
                console.error('[FOXCRAFT] Üzv sayı alınmadı:', error.message);
            }
        }
        return publicReply(null, [foxcraftEmbed('FoxCraft', 'Minecraft server\nAzərbaycan Minecraft icması', [
            { name: 'Server IP', value: ip, inline: true },
            { name: 'Versiya', value: version, inline: true },
            { name: 'Discord', value: interaction.guild_id ? 'Bu server' : 'Yaxında', inline: true },
            { name: 'Üzvlər', value: memberCount, inline: true },
        ])]);
    },
    prefixExecute: async (message) => {
        const { ip, version } = getServerValues();
        return message.reply({ embeds: [foxcraftEmbed('FoxCraft', 'Minecraft server\nAzərbaycan Minecraft icması', [
            { name: 'Server IP', value: ip, inline: true },
            { name: 'Versiya', value: version, inline: true },
            { name: 'Discord', value: 'Bu server', inline: true },
            { name: 'Üzvlər', value: String(message.guild.memberCount), inline: true },
        ])] });
    },
};
