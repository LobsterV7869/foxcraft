const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { ephemeralReply, getOption } = require('../utils/interaction');
const { can, logError } = require('../utils/moderation');
const { logModAction } = require('../utils/modlog');

const { t } = require('../utils/lang');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unban')
        .setDescription('Removes a ban from a member')
        .addUserOption((option) => option.setName('user').setDescription('Target user').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('Reason').setRequired(false)),
    async execute(interaction) {
        if (!can(interaction.member, PermissionFlagsBits.BanMembers)) return ephemeralReply(t(interaction.guild_id, 'perm_ban_members'));
        try {
            const guild = await interaction.discordClient.guilds.fetch(interaction.guild_id);
            const actor = await guild.members.fetch(interaction.user?.id || interaction.member?.user?.id);
            const bannedId = getOption(interaction, 'user');
            const banned = await guild.bans.fetch(bannedId).catch(() => null);
            if (!banned) return ephemeralReply(t(interaction.guild_id, 'user_not_banned'));
            const reason = getOption(interaction, 'reason') || t(interaction.guild_id, 'mod_no_reason');
            await guild.bans.remove(bannedId, reason);
            await logModAction(guild, 'unban', `${actor.user.tag} -> ${banned.user.tag}\nReason: ${reason}`);
            return ephemeralReply(t(interaction.guild_id, 'ban_removed', { user: (banned.user.tag) }));
        } catch (error) {
            logError('/unban', error);
            return ephemeralReply(t(interaction.guild_id, 'unban_failed'));
        }
    },
    async prefixExecute(message, args) {
        if (!can(message.member, PermissionFlagsBits.BanMembers)) return message.reply(t(message.guild?.id, 'perm_ban_members'));
        const targetId = args[0]?.replace(/[<@!>]/g, '');
        if (!targetId) return message.reply(t(message.guild?.id, 'usage_unban'));
        const reason = args.slice(1).join(' ') || t(message.guild?.id, 'mod_no_reason');
        try {
            const banned = await message.guild.bans.fetch(targetId).catch(() => null);
            if (!banned) return message.reply(t(message.guild?.id, 'user_not_banned'));
            await message.guild.bans.remove(targetId, reason);
            await logModAction(message.guild, 'unban', `${message.author.tag} -> ${banned.user.tag}\nReason: ${reason}`);
            return message.reply(t(message.guild?.id, 'ban_removed', { user: (banned.user.tag) }));
        } catch (error) {
            logError('!unban', error);
            return message.reply(t(message.guild?.id, 'unban_failed'));
        }
    },
};