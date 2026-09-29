const { SlashCommandBuilder } = require('discord.js');
const { getServerValues, foxcraftEmbed, discordRequest } = require('../utils/foxcraft');
const { publicReply } = require('../utils/interaction');
const { t } = require('../utils/lang');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('foxcraft-info')
        .setDescription('Shows FoxCraft server information'),
    async execute(interaction) {
        const guildId = interaction.guild_id;
        const { ip, version } = getServerValues();
        const unknown = t(guildId, 'common_unknown');
        let memberCount = unknown;
        if (guildId) {
            try {
                const guild = await discordRequest('GET', `/guilds/${guildId}?with_counts=true`);
                memberCount = String(guild.approximate_member_count || guild.member_count || unknown);
            } catch (error) {
                console.error('[FOXCRAFT] Member count could not be fetched:', error.message);
            }
        }
        return publicReply(null, [foxcraftEmbed('FoxCraft', t(guildId, 'foxcraft_tagline'), [
            { name: t(guildId, 'foxcraft_server_ip'), value: ip, inline: true },
            { name: t(guildId, 'foxcraft_version'), value: version, inline: true },
            { name: 'Discord', value: guildId ? t(guildId, 'foxcraft_this_server') : unknown, inline: true },
            { name: t(guildId, 'foxcraft_members'), value: memberCount, inline: true },
        ])]);
    },
    prefixExecute: async (message) => {
        const guildId = message.guild?.id;
        const { ip, version } = getServerValues();
        return message.reply({ embeds: [foxcraftEmbed('FoxCraft', t(guildId, 'foxcraft_tagline'), [
            { name: t(guildId, 'foxcraft_server_ip'), value: ip, inline: true },
            { name: t(guildId, 'foxcraft_version'), value: version, inline: true },
            { name: 'Discord', value: t(guildId, 'foxcraft_this_server'), inline: true },
            { name: t(guildId, 'foxcraft_members'), value: String(message.guild.memberCount), inline: true },
        ])] });
    },
};
