const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { ephemeralReply } = require('../utils/interaction');
const { can, logError } = require('../utils/moderation');
const { logModAction } = require('../utils/modlog');

async function resolveChannel(interaction) {
    if (interaction.channel) return interaction.channel;
    if (interaction.channel_id) return interaction.discordClient.channels.fetch(interaction.channel_id).catch(() => null);
    return null;
}

module.exports = {
    data: new SlashCommandBuilder().setName('lock').setDescription('Kanalı kilidləyir (üzv mesaj yaza bilməz)'),
    async execute(interaction) {
        if (!can(interaction.member, PermissionFlagsBits.ManageChannels)) return ephemeralReply('Bu əmrlə işləmək üçün Manage Channels icazəsi lazımdır.');
        try {
            const guild = await interaction.discordClient.guilds.fetch(interaction.guild_id);
            const actor = await guild.members.fetch(interaction.user?.id || interaction.member?.user?.id);
            const channel = await resolveChannel(interaction);
            if (!channel?.isTextBased()) return ephemeralReply('Uyğun mətn kanalı tapılmadı.');
            const everyone = guild.roles.everyone;
            const overwrite = channel.permissionOverwrites.cache.get(everyone.id);
            if (overwrite && overwrite.deny.has(PermissionFlagsBits.SendMessages)) {
                return ephemeralReply('Kanal artıq kilidlidir.');
            }
            await channel.permissionOverwrites.edit(everyone, { SendMessages: false }, 'FoxCraft kanal kilidi');
            await logModAction(guild, 'lock', `${actor.user.tag} → #${channel.name}`);
            return ephemeralReply(`🔒 ${channel} kilidləndi.`);
        } catch (error) {
            logError('/lock', error);
            return ephemeralReply('Kanal kilidlənə bilmədi.');
        }
    },
    async prefixExecute(message) {
        if (!can(message.member, PermissionFlagsBits.ManageChannels)) return message.reply('Bu əmrlə işləmək üçün Manage Channels icazəsi lazımdır.');
        try {
            const channel = message.channel;
            const overwrite = channel.permissionOverwrites.cache.get(message.guild.roles.everyone.id);
            if (overwrite && overwrite.deny.has(PermissionFlagsBits.SendMessages)) return message.reply('Kanal artıq kilidlidir.');
            await channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false }, 'FoxCraft kanal kilidi');
            await logModAction(message.guild, 'lock', `${message.author.tag} → #${channel.name}`);
            return message.reply(`🔒 ${channel} kilidləndi.`);
        } catch (error) {
            logError('!lock', error);
            return message.reply('Kanal kilidlənə bilmədi.');
        }
    },
};