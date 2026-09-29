const { SlashCommandBuilder } = require('discord.js');
const { ephemeralReply, getOption } = require('../utils/interaction');
const { PermissionFlagsBits, can, canActOn, getTarget, logError } = require('../utils/moderation');
const { logModAction } = require('../utils/modlog');

const { t } = require('../utils/lang');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('untimeout')
        .setDescription('Lifts an active timeout on a member')
        .addUserOption((option) => option.setName('user').setDescription('Target member').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('Reason').setRequired(false)),
    aliases: ['untempmute'],
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
            await target.timeout(null, reason);
            await logModAction(guild, 'timeout', `${actor.user.tag} -> ${target.user.tag}\nTimeout lifted. Reason: ${reason}`);
            return ephemeralReply(t(interaction.guild_id, 'timeout_lifted', { user: (target.user.tag) }));
        } catch (error) {
            logError('/untimeout', error);
            return ephemeralReply(t(interaction.guild_id, 'timeout_lift_failed'));
        }
    },
    async prefixExecute(message, args) {
        if (!can(message.member, PermissionFlagsBits.ModerateMembers)) {
            return message.reply(t(message.guild?.id, 'no_permission'));
        }
        const targetId = args[0]?.replace(/[<@!>]/g, '');
        if (!targetId) return message.reply(t(message.guild?.id, 'usage_untimeout'));
        try {
            const target = await getTarget(message.guild, targetId);
            if (!canActOn(message.member, target)) return message.reply(t(message.guild?.id, 'cannot_manage_member'));

            const reason = args.slice(1).join(' ') || t(message.guild?.id, 'mod_no_reason');
            await target.timeout(null, reason);
            await logModAction(message.guild, 'timeout', `${message.author.tag} -> ${target.user.tag}\nTimeout lifted. Reason: ${reason}`);
            return message.reply(t(message.guild?.id, 'timeout_lifted', { user: (target.user.tag) }));
        } catch (error) {
            logError('!untimeout', error);
            return message.reply(t(message.guild?.id, 'timeout_lift_failed'));
        }
    },
};
