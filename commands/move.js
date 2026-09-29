const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { ephemeralReply, getOption } = require('../utils/interaction');
const { can, canActOn, getTarget, logError } = require('../utils/moderation');
const { logModAction } = require('../utils/modlog');
const { findVoiceChannel } = require('../utils/music');

const { t } = require('../utils/lang');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('move')
        .setDescription('Forces a member into another voice channel')
        .addUserOption((option) => option.setName('user').setDescription('Target member').setRequired(true))
        .addStringOption((option) => option.setName('channel').setDescription('Destination voice channel').setRequired(true)),
    aliases: ['movevoice', 'voicemove'],
    async execute(interaction) {
        if (!can(interaction.member, PermissionFlagsBits.MoveMembers)) {
            return ephemeralReply(t(interaction.guild_id, 'no_permission'));
        }
        try {
            const guild = await interaction.discordClient.guilds.fetch(interaction.guild_id);
            const actor = await guild.members.fetch(interaction.user?.id || interaction.member?.user?.id);
            const target = await getTarget(guild, getOption(interaction, 'user'));
            if (!canActOn(actor, target)) return ephemeralReply(t(interaction.guild_id, 'cannot_manage_member'));

            const destination = findVoiceChannel(guild, getOption(interaction, 'channel'));
            if (!destination) return ephemeralReply(t(interaction.guild_id, 'voice_channel_not_found'));
            if (!destination.permissionsFor(guild.members.me)?.has(PermissionFlagsBits.MoveMembers)) {
                return ephemeralReply(t(interaction.guild_id, 'move_no_perm'));
            }

            await target.setVoiceChannel(destination);
            await logModAction(guild, 'move', `${actor.user.tag} -> ${target.user.tag}\nMoved to #${destination.name}`);
            return ephemeralReply(t(interaction.guild_id, 'member_moved', { user: (target.user.tag), channel: (destination.name) }));
        } catch (error) {
            logError('/move', error);
            return ephemeralReply(t(interaction.guild_id, 'member_not_moved'));
        }
    },
    async prefixExecute(message, args) {
        if (!can(message.member, PermissionFlagsBits.MoveMembers)) {
            return message.reply(t(message.guild?.id, 'no_permission'));
        }
        const targetId = args[0]?.replace(/[<@!>]/g, '');
        const channelQuery = args[1];
        if (!targetId || !channelQuery) return message.reply(t(message.guild?.id, 'usage_move'));

        try {
            const target = await getTarget(message.guild, targetId);
            if (!canActOn(message.member, target)) return message.reply(t(message.guild?.id, 'cannot_manage_member'));

            const destination = findVoiceChannel(message.guild, channelQuery.replace(/[<#>]/g, ''));
            if (!destination) return message.reply(t(message.guild?.id, 'voice_channel_not_found'));
            if (!destination.permissionsFor(message.guild.members.me)?.has(PermissionFlagsBits.MoveMembers)) {
                return message.reply(t(message.guild?.id, 'move_no_perm'));
            }

            await target.setVoiceChannel(destination);
            await logModAction(message.guild, 'move', `${message.author.tag} -> ${target.user.tag}\nMoved to #${destination.name}`);
            return message.reply(t(message.guild?.id, 'member_moved', { user: (target.user.tag), channel: (destination.name) }));
        } catch (error) {
            logError('!move', error);
            return message.reply(t(message.guild?.id, 'member_not_moved'));
        }
    },
};
