const { SlashCommandBuilder } = require('discord.js');
const { ephemeralReply, getOption } = require('../utils/interaction');
const { PermissionFlagsBits, can, canActOn, getTarget, logError } = require('../utils/moderation');
const { parseDuration, formatDuration } = require('../utils/duration');
const { logModAction } = require('../utils/modlog');

const { t } = require('../utils/lang');

const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('timeout')
        .setDescription('Times a member out (max 28 days)')
        .addUserOption((option) => option.setName('user').setDescription('Target member').setRequired(true))
        .addStringOption((option) => option.setName('duration').setDescription('Duration, e.g. 10m, 2h, 7d').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('Reason').setRequired(false)),
    aliases: ['tempmute'],
    async execute(interaction) {
        if (!can(interaction.member, PermissionFlagsBits.ModerateMembers)) {
            return ephemeralReply(t(interaction.guild_id, 'no_permission'));
        }
        const durationMs = parseDuration(getOption(interaction, 'duration'));
        if (!durationMs || durationMs > MAX_TIMEOUT_MS) {
            return ephemeralReply(t(interaction.guild_id, 'timeout_bad_duration'));
        }
        try {
            const guild = await interaction.discordClient.guilds.fetch(interaction.guild_id);
            const actor = await guild.members.fetch(interaction.user?.id || interaction.member?.user?.id);
            const target = await getTarget(guild, getOption(interaction, 'user'));
            if (!canActOn(actor, target)) return ephemeralReply(t(interaction.guild_id, 'cannot_manage_member'));

            const reason = getOption(interaction, 'reason') || t(interaction.guild_id, 'mod_no_reason');
            await target.timeout(durationMs, reason);
            await logModAction(guild, 'timeout', `${actor.user.tag} -> ${target.user.tag}\nDuration: ${formatDuration(durationMs)}\nReason: ${reason}`);
            return ephemeralReply(t(interaction.guild_id, 'timeout_applied', { user: (target.user.tag), duration: (formatDuration(durationMs)) }));
        } catch (error) {
            logError('/timeout', error);
            return ephemeralReply(t(interaction.guild_id, 'timeout_failed'));
        }
    },
    async prefixExecute(message, args) {
        if (!can(message.member, PermissionFlagsBits.ModerateMembers)) {
            return message.reply(t(message.guild?.id, 'no_permission'));
        }
        const targetId = args[0]?.replace(/[<@!>]/g, '');
        const durationMs = parseDuration(args[1]);
        if (!targetId || !durationMs || durationMs > MAX_TIMEOUT_MS) {
            return message.reply(t(message.guild?.id, 'usage_timeout'));
        }
        try {
            const target = await getTarget(message.guild, targetId);
            if (!canActOn(message.member, target)) return message.reply(t(message.guild?.id, 'cannot_manage_member'));

            const reason = args.slice(2).join(' ') || t(message.guild?.id, 'mod_no_reason');
            await target.timeout(durationMs, reason);
            await logModAction(message.guild, 'timeout', `${message.author.tag} -> ${target.user.tag}\nDuration: ${formatDuration(durationMs)}\nReason: ${reason}`);
            return message.reply(t(message.guild?.id, 'timeout_applied', { user: (target.user.tag), duration: (formatDuration(durationMs)) }));
        } catch (error) {
            logError('!timeout', error);
            return message.reply(t(message.guild?.id, 'timeout_failed'));
        }
    },
};
