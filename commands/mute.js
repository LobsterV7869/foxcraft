const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { ephemeralReply, getOption } = require('../utils/interaction');
const { can, canActOn, getTarget, logError } = require('../utils/moderation');
const { parseDuration, formatDuration } = require('../utils/duration');
const { logModAction } = require('../utils/modlog');

const { t } = require('../utils/lang');

async function muteTarget(actor, target, durationMs, reason) {
    if (!canActOn(actor, target)) return 'You cannot manage this member: check the role hierarchy.';
    if (target.communicationDisabledUntil && target.communicationDisabledUntil > Date.now()) {
        return `${target.user.tag} is already muted.`;
    }
    await target.timeout(durationMs, reason);
    return null;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Times a member out so they cannot send messages')
        .addUserOption((option) => option.setName('user').setDescription('Target member').setRequired(true))
        .addStringOption((option) => option.setName('duration').setDescription('Duration, e.g. 1h30m (10m max 28d)').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('Reason').setRequired(false)),
    async execute(interaction) {
        if (!can(interaction.member, PermissionFlagsBits.ModerateMembers)) return ephemeralReply(t(interaction.guild_id, 'no_permission'));
        const durationMs = parseDuration(getOption(interaction, 'duration') || getOption(interaction, 'müddət'));
        if (!durationMs) return ephemeralReply(t(interaction.guild_id, 'mute_bad_duration'));
        try {
            const guild = await interaction.discordClient.guilds.fetch(interaction.guild_id);
            const actor = await guild.members.fetch(interaction.user?.id || interaction.member?.user?.id);
            const target = await getTarget(guild, getOption(interaction, 'user'));
            const reason = getOption(interaction, 'reason') || t(interaction.guild_id, 'mod_no_reason');
            const blocked = await muteTarget(actor, target, durationMs, reason);
            if (blocked) return ephemeralReply(blocked);
            await logModAction(guild, 'mute', `${actor.user.tag} -> ${target.user.tag}\nDuration: ${formatDuration(durationMs)}\nReason: ${reason}`);
            return ephemeralReply(t(interaction.guild_id, 'user_muted', { user: (target.user.tag), duration: (formatDuration(durationMs)) }));
        } catch (error) {
            logError('/mute', error);
            return ephemeralReply(t(interaction.guild_id, 'mute_failed'));
        }
    },
    async prefixExecute(message, args) {
        if (!can(message.member, PermissionFlagsBits.ModerateMembers)) return message.reply(t(message.guild?.id, 'no_permission'));
        const targetId = args[0]?.replace(/[<@!>]/g, '');
        const durationMs = parseDuration(args[1]);
        if (!targetId || !durationMs) return message.reply(t(message.guild?.id, 'usage_mute'));
        const reason = args.slice(2).join(' ') || t(message.guild?.id, 'mod_no_reason');
        try {
            const target = await getTarget(message.guild, targetId);
            const blocked = await muteTarget(message.member, target, durationMs, reason);
            if (blocked) return message.reply(blocked);
            await logModAction(message.guild, 'mute', `${message.author.tag} -> ${target.user.tag}\nDuration: ${formatDuration(durationMs)}\nReason: ${reason}`);
            return message.reply(t(message.guild?.id, 'user_muted', { user: (target.user.tag), duration: (formatDuration(durationMs)) }));
        } catch (error) {
            logError('!mute', error);
            return message.reply(t(message.guild?.id, 'mute_failed'));
        }
    },
};