const { SlashCommandBuilder } = require('discord.js');
const { ephemeralReply, getOption } = require('../utils/interaction');
const { PermissionFlagsBits, can, canActOn, getTarget, logError } = require('../utils/moderation');
const { logModAction } = require('../utils/modlog');

const { t } = require('../utils/lang');

/**
 * Kicks a member and immediately bans them, which forces Discord to drop the
 * cached avatar and nickname. Unbanning happens right away unless the caller
 * asks to keep the ban in place.
 */
module.exports = {
    data: new SlashCommandBuilder()
        .setName('softban')
        .setDescription('Kicks and re-bans a member to refresh their profile, then unbans them')
        .addUserOption((option) => option.setName('user').setDescription('Target member').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('Reason').setRequired(false))
        .addBooleanOption((option) => option.setName('keepban').setDescription('Keep the ban in place').setRequired(false)),
    async execute(interaction) {
        if (!can(interaction.member, PermissionFlagsBits.BanMembers)) {
            return ephemeralReply(t(interaction.guild_id, 'no_permission'));
        }
        try {
            const guild = await interaction.discordClient.guilds.fetch(interaction.guild_id);
            const actor = await guild.members.fetch(interaction.user?.id || interaction.member?.user?.id);
            const target = await getTarget(guild, getOption(interaction, 'user'));
            if (!canActOn(actor, target)) return ephemeralReply(t(interaction.guild_id, 'cannot_manage_member'));

            const reason = getOption(interaction, 'reason') || t(interaction.guild_id, 'mod_no_reason');
            const keepBan = getOption(interaction, 'keepban') === true;

            await target.ban({ reason });
            if (!keepBan) await guild.members.unban(target.user.id, 'Softban complete.');

            await logModAction(guild, 'ban', `${actor.user.tag} -> ${target.user.tag}\nSoftban${keepBan ? ' (ban kept)' : ''}\nReason: ${reason}`);
            return ephemeralReply(t(interaction.guild_id, keepBan ? 'softban_done_kept' : 'softban_done', { user: target.user.tag }));
        } catch (error) {
            logError('/softban', error);
            return ephemeralReply(t(interaction.guild_id, 'softban_failed'));
        }
    },
    async prefixExecute(message, args) {
        if (!can(message.member, PermissionFlagsBits.BanMembers)) {
            return message.reply(t(message.guild?.id, 'no_permission'));
        }
        const targetId = args[0]?.replace(/[<@!>]/g, '');
        if (!targetId) return message.reply(t(message.guild?.id, 'usage_softban'));
        const keepBan = args.includes('--keep');
        try {
            const target = await getTarget(message.guild, targetId);
            if (!canActOn(message.member, target)) return message.reply(t(message.guild?.id, 'cannot_manage_member'));

            const reason = args.slice(1).filter((a) => a !== '--keep').join(' ') || t(message.guild?.id, 'mod_no_reason');
            await target.ban({ reason });
            if (!keepBan) await message.guild.members.unban(target.user.id, 'Softban complete.');

            await logModAction(message.guild, 'ban', `${message.author.tag} -> ${target.user.tag}\nSoftban${keepBan ? ' (ban kept)' : ''}\nReason: ${reason}`);
            return message.reply(t(message.guild?.id, keepBan ? 'softban_done_kept' : 'softban_done', { user: target.user.tag }));
        } catch (error) {
            logError('!softban', error);
            return message.reply(t(message.guild?.id, 'softban_failed'));
        }
    },
};
