const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { ephemeralReply, getOption } = require('../utils/interaction');
const { can, logError } = require('../utils/moderation');
const { logModAction } = require('../utils/modlog');

async function resolveChannel(interaction) {
    if (interaction.channel) return interaction.channel;
    if (interaction.channel_id) return interaction.discordClient.channels.fetch(interaction.channel_id).catch(() => null);
    return null;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('slowmode')
        .setDescription('Kanalda yavaş rejim (saniyə) təyin edir')
        .addIntegerOption((option) => option.setName('saniye')
            .setDescription('0-21600 arası saniyə (0 söndürür)')
            .setMinValue(0).setMaxValue(21600).setRequired(true)),
    async execute(interaction) {
        if (!can(interaction.member, PermissionFlagsBits.ManageChannels)) return ephemeralReply('Bu əmrlə işləmək üçün Manage Channels icazəsi lazımdır.');
        const seconds = getOption(interaction, 'saniye');
        if (!Number.isInteger(seconds)) return ephemeralReply('Düzgün saniyə daxil et.');
        try {
            const guild = await interaction.discordClient.guilds.fetch(interaction.guild_id);
            const actor = await guild.members.fetch(interaction.user?.id || interaction.member?.user?.id);
            const channel = await resolveChannel(interaction);
            if (!channel?.isTextBased()) return ephemeralReply('Uyğun mətn kanalı tapılmadı.');
            await channel.setRateLimitPerUser(seconds, 'FoxCraft slowmode');
            await logModAction(guild, 'slowmode', `${actor.user.tag} → #${channel.name}: ${seconds}s`);
            return ephemeralReply(`🐢 ${channel} yavaş rejim: **${seconds} saniyə**.`);
        } catch (error) {
            logError('/slowmode', error);
            return ephemeralReply('Slowmode təyin edilə bilmədi.');
        }
    },
    async prefixExecute(message, args) {
        if (!can(message.member, PermissionFlagsBits.ManageChannels)) return message.reply('Bu əmrlə işləmək üçün Manage Channels icazəsi lazımdır.');
        const seconds = Number(args[0]);
        if (!Number.isInteger(seconds) || seconds < 0 || seconds > 21600) return message.reply('İstifadə: `!slowmode <0-21600>`');
        try {
            await message.channel.setRateLimitPerUser(seconds, 'FoxCraft slowmode');
            await logModAction(message.guild, 'slowmode', `${message.author.tag} → #${message.channel.name}: ${seconds}s`);
            return message.reply(`🐢 ${message.channel} yavaş rejim: **${seconds} saniyə**.`);
        } catch (error) {
            logError('!slowmode', error);
            return message.reply('Slowmode təyin edilə bilmədi.');
        }
    },
};