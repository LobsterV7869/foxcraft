const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { ephemeralReply } = require('../utils/interaction');
const { can, logError } = require('../utils/moderation');
const { logModAction } = require('../utils/modlog');

const { t } = require('../utils/lang');

async function resolveChannel(interaction) {
    if (interaction.channel) return interaction.channel;
    if (interaction.channel_id) return interaction.discordClient.channels.fetch(interaction.channel_id).catch(() => null);
    return null;
}

module.exports = {
    data: new SlashCommandBuilder().setName('unlock').setDescription('Unlocks a locked channel'),
    async execute(interaction) {
        if (!can(interaction.member, PermissionFlagsBits.ManageChannels)) return ephemeralReply(t(interaction.guild_id, 'perm_manage_channels'));
        try {
            const guild = await interaction.discordClient.guilds.fetch(interaction.guild_id);
            const actor = await guild.members.fetch(interaction.user?.id || interaction.member?.user?.id);
            const channel = await resolveChannel(interaction);
            if (!channel?.isTextBased()) return ephemeralReply(t(interaction.guild_id, 'channel_not_found'));
            const everyone = guild.roles.everyone;
            const overwrite = channel.permissionOverwrites.cache.get(everyone.id);
            if (!overwrite || !overwrite.deny.has(PermissionFlagsBits.SendMessages)) {
                return ephemeralReply(t(interaction.guild_id, 'unlock_already'));
            }
            await channel.permissionOverwrites.edit(everyone, { SendMessages: null }, 'FoxCraft channel unlock');
            await logModAction(guild, 'unlock', `${actor.user.tag} -> #${channel.name}`);
            return ephemeralReply(t(interaction.guild_id, 'channel_unlocked', { channel: (channel) }));
        } catch (error) {
            logError('/unlock', error);
            return ephemeralReply(t(interaction.guild_id, 'unlock_failed'));
        }
    },
    async prefixExecute(message) {
        if (!can(message.member, PermissionFlagsBits.ManageChannels)) return message.reply(t(message.guild?.id, 'perm_manage_channels'));
        try {
            const channel = message.channel;
            const overwrite = channel.permissionOverwrites.cache.get(message.guild.roles.everyone.id);
            if (!overwrite || !overwrite.deny.has(PermissionFlagsBits.SendMessages)) return message.reply(t(message.guild?.id, 'unlock_already'));
            await channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null }, 'FoxCraft channel unlock');
            await logModAction(message.guild, 'unlock', `${message.author.tag} -> #${channel.name}`);
            return message.reply(t(message.guild?.id, 'channel_unlocked', { channel: (channel) }));
        } catch (error) {
            logError('!unlock', error);
            return message.reply(t(message.guild?.id, 'unlock_failed'));
        }
    },
};