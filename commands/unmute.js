const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { ephemeralReply, getOption } = require('../utils/interaction');
const { can, canActOn, getTarget, logError } = require('../utils/moderation');
const { logModAction } = require('../utils/modlog');

const { t } = require('../utils/lang');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unmute')
        .setDescription('Removes a member timeout')
        .addUserOption((option) => option.setName('user').setDescription('Target member').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('Reason').setRequired(false)),
    async execute(interaction) {
        if (!can(interaction.member, PermissionFlagsBits.ModerateMembers)) return ephemeralReply(t(interaction.guild_id, 'no_permission'));
        try {
            const guild = await interaction.discordClient.guilds.fetch(interaction.guild_id);
            const actor = await guild.members.fetch(interaction.user?.id || interaction.member?.user?.id);
            const target = await getTarget(guild, getOption(interaction, 'user'));
            if (!canActOn(actor, target)) return ephemeralReply(t(interaction.guild_id, 'cannot_manage_member'));
            if (!target.communicationDisabledUntil || target.communicationDisabledUntil <= Date.now()) {
                return ephemeralReply(t(interaction.guild_id, 'user_not_muted', { user: (target.user.tag) }));
            }
            await target.timeout(null);
            const reason = getOption(interaction, 'reason') || t(interaction.guild_id, 'mod_no_reason');
            await logModAction(guild, 'unmute', `${actor.user.tag} -> ${target.user.tag}\nReason: ${reason}`);
            return ephemeralReply(t(interaction.guild_id, 'timeout_removed', { user: (target.user.tag) }));
        } catch (error) {
            logError('/unmute', error);
            return ephemeralReply(t(interaction.guild_id, 'unmute_failed'));
        }
    },
    async prefixExecute(message, args) {
        if (!can(message.member, PermissionFlagsBits.ModerateMembers)) return message.reply(t(message.guild?.id, 'no_permission'));
        const targetId = args[0]?.replace(/[<@!>]/g, '');
        if (!targetId) return message.reply(t(message.guild?.id, 'usage_unmute'));
        const reason = args.slice(1).join(' ') || t(message.guild?.id, 'mod_no_reason');
        try {
            const target = await getTarget(message.guild, targetId);
            if (!canActOn(message.member, target)) return message.reply(t(message.guild?.id, 'cannot_manage_member'));
            if (!target.communicationDisabledUntil || target.communicationDisabledUntil <= Date.now()) {
                return message.reply(t(message.guild?.id, 'user_not_muted', { user: (target.user.tag) }));
            }
            await target.timeout(null);
            await logModAction(message.guild, 'unmute', `${message.author.tag} -> ${target.user.tag}\nReason: ${reason}`);
            return message.reply(t(message.guild?.id, 'timeout_removed', { user: (target.user.tag) }));
        } catch (error) {
            logError('!unmute', error);
            return message.reply(t(message.guild?.id, 'unmute_failed'));
        }
    },
};