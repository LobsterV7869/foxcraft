const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { ephemeralReply, getOption } = require('../utils/interaction');
const { can, logError } = require('../utils/moderation');
const { logModAction } = require('../utils/modlog');

const { t } = require('../utils/lang');

async function resolveChannel(interaction) {
    if (interaction.channel) return interaction.channel;
    if (interaction.channel_id) return interaction.discordClient.channels.fetch(interaction.channel_id).catch(() => null);
    return null;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('slowmode')
        .setDescription('Sets the channel slowmode delay in seconds')
        .addIntegerOption((option) => option.setName('seconds')
            .setDescription('Seconds between 0 and 21600 (0 disables slowmode)')
            .setMinValue(0).setMaxValue(21600).setRequired(true)),
    async execute(interaction) {
        if (!can(interaction.member, PermissionFlagsBits.ManageChannels)) return ephemeralReply(t(interaction.guild_id, 'perm_manage_channels'));
        const seconds = getOption(interaction, 'seconds') ?? getOption(interaction, 'saniye');
        if (!Number.isInteger(seconds)) return ephemeralReply(t(interaction.guild_id, 'slowmode_bad_number'));
        try {
            const guild = await interaction.discordClient.guilds.fetch(interaction.guild_id);
            const actor = await guild.members.fetch(interaction.user?.id || interaction.member?.user?.id);
            const channel = await resolveChannel(interaction);
            if (!channel?.isTextBased()) return ephemeralReply(t(interaction.guild_id, 'channel_not_found'));
            await channel.setRateLimitPerUser(seconds, 'FoxCraft slowmode');
            await logModAction(guild, 'slowmode', `${actor.user.tag} -> #${channel.name}: ${seconds}s`);
            return ephemeralReply(t(interaction.guild_id, 'slowmode_set', { channel: (channel), seconds: (seconds) }));
        } catch (error) {
            logError('/slowmode', error);
            return ephemeralReply(t(interaction.guild_id, 'slowmode_failed'));
        }
    },
    async prefixExecute(message, args) {
        if (!can(message.member, PermissionFlagsBits.ManageChannels)) return message.reply(t(message.guild?.id, 'perm_manage_channels'));
        const seconds = Number(args[0]);
        if (!Number.isInteger(seconds) || seconds < 0 || seconds > 21600) return message.reply(t(message.guild?.id, 'usage_slowmode'));
        try {
            await message.channel.setRateLimitPerUser(seconds, 'FoxCraft slowmode');
            await logModAction(message.guild, 'slowmode', `${message.author.tag} -> #${message.channel.name}: ${seconds}s`);
            return message.reply(t(message.guild?.id, 'slowmode_set', { channel: (message.channel), seconds: (seconds) }));
        } catch (error) {
            logError('!slowmode', error);
            return message.reply(t(message.guild?.id, 'slowmode_failed'));
        }
    },
};