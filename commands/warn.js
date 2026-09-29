const { SlashCommandBuilder } = require('discord.js');
const { ephemeralReply, getOption } = require('../utils/interaction');
const { PermissionFlagsBits, can, canActOn, getTarget, logError } = require('../utils/moderation');
const { logModAction } = require('../utils/modlog');
const { addWarning, countWarnings } = require('../utils/db');

const { t } = require('../utils/lang');

/** Warns at this many points the member is muted automatically. */
const AUTO_MUTE_THRESHOLD = 3;
const AUTO_MUTE_MS = 60 * 60 * 1000;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Warns a member and records the reason')
        .addUserOption((option) => option.setName('user').setDescription('Target member').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('Reason').setRequired(false)),
    async execute(interaction) {
        if (!can(interaction.member, PermissionFlagsBits.ModerateMembers)) {
            return ephemeralReply(t(interaction.guild_id, 'no_permission'));
        }
        try {
            const guild = await interaction.discordClient.guilds.fetch(interaction.guild_id);
            const actor = await guild.members.fetch(interaction.user?.id || interaction.member?.user?.id);
            const target = await getTarget(guild, getOption(interaction, 'user'));
            if (!canActOn(actor, target)) return ephemeralReply(t(interaction.guild_id, 'cannot_manage_member'));

            const reason = getOption(interaction, 'reason') || t(interaction.guild_id, 'mod_no_reason');
            addWarning(guild.id, target.id, actor.user.tag, reason);
            const total = countWarnings(guild.id, target.id);

            let extra = '';
            if (total >= AUTO_MUTE_THRESHOLD && !target.communicationDisabledUntil) {
                try {
                    await target.timeout(AUTO_MUTE_MS, `Reached ${total} warnings.`);
                    extra = t(interaction.guild_id, 'warn_automute_done', { count: AUTO_MUTE_THRESHOLD });
                } catch {
                    extra = t(interaction.guild_id, 'warn_automute_failed');
                }
            }

            await logModAction(guild, 'warn', `${actor.user.tag} -> ${target.user.tag}\nWarning ${total}: ${reason}`);
            return ephemeralReply(t(interaction.guild_id, 'warn_issued', { user: (target.user.tag), total: (total), extra: (extra) }));
        } catch (error) {
            logError('/warn', error);
            return ephemeralReply(t(interaction.guild_id, 'warn_failed'));
        }
    },
    async prefixExecute(message, args) {
        if (!can(message.member, PermissionFlagsBits.ModerateMembers)) {
            return message.reply(t(message.guild?.id, 'no_permission'));
        }
        const targetId = args[0]?.replace(/[<@!>]/g, '');
        if (!targetId) return message.reply(t(message.guild?.id, 'usage_warn'));
        try {
            const target = await getTarget(message.guild, targetId);
            if (!canActOn(message.member, target)) return message.reply(t(message.guild?.id, 'cannot_manage_member'));

            const reason = args.slice(1).join(' ') || t(message.guild?.id, 'mod_no_reason');
            addWarning(message.guild.id, target.id, message.author.tag, reason);
            const total = countWarnings(message.guild.id, target.id);

            let extra = '';
            if (total >= AUTO_MUTE_THRESHOLD && !target.communicationDisabledUntil) {
                try {
                    await target.timeout(AUTO_MUTE_MS, `Reached ${total} warnings.`);
                    extra = t(message.guild?.id, 'warn_automute_done', { count: AUTO_MUTE_THRESHOLD });
                } catch {
                    extra = t(message.guild?.id, 'warn_automute_failed');
                }
            }

            await logModAction(message.guild, 'warn', `${message.author.tag} -> ${target.user.tag}\nWarning ${total}: ${reason}`);
            return message.reply(t(message.guild?.id, 'warn_issued', { user: (target.user.tag), total: (total), extra: (extra) }));
        } catch (error) {
            logError('!warn', error);
            return message.reply(t(message.guild?.id, 'warn_failed'));
        }
    },
};
