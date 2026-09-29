const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { ephemeralReply, getOption } = require('../utils/interaction');
const { can, canActOn, getTarget, logError } = require('../utils/moderation');
const { logModAction } = require('../utils/modlog');

const { t } = require('../utils/lang');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('addrole')
        .setDescription('Gives a role to a member')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addUserOption((option) => option.setName('user').setDescription('Target member').setRequired(true))
        .addRoleOption((option) => option.setName('role').setDescription('Role to give').setRequired(true)),
    async execute(interaction) {
        if (!can(interaction.member, PermissionFlagsBits.ManageRoles)) {
            return ephemeralReply(t(interaction.guild_id, 'perm_manage_roles'));
        }
        try {
            const guild = await interaction.discordClient.guilds.fetch(interaction.guild_id);
            const actor = await guild.members.fetch(interaction.user?.id || interaction.member?.user?.id);
            const target = await getTarget(guild, getOption(interaction, 'user'));
            if (!canActOn(actor, target)) return ephemeralReply(t(interaction.guild_id, 'cannot_manage_member'));

            const roleId = getOption(interaction, 'role');
            const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
            if (!role) return ephemeralReply(t(interaction.guild_id, 'role_not_found'));
            if (role.managed) return ephemeralReply(t(interaction.guild_id, 'role_integrated_give'));
            if (actor.roles.highest.comparePositionTo(role) < 0) {
                return ephemeralReply(t(interaction.guild_id, 'role_hierarchy_give'));
            }
            if (target.roles.cache.has(role.id)) {
                return ephemeralReply(t(interaction.guild_id, 'role_already_has', { user: (target.user.tag), role: (role.name) }));
            }

            await target.roles.add(role, `${actor.user.tag} via /addrole`);
            await logModAction(guild, 'addrole', `${actor.user.tag} -> ${target.user.tag}\nRole: ${role.name}`);
            return ephemeralReply(t(interaction.guild_id, 'role_given', { role: (role.name), user: (target.user.tag) }));
        } catch (error) {
            logError('/addrole', error);
            return ephemeralReply(t(interaction.guild_id, 'role_give_failed'));
        }
    },
    async prefixExecute(message, args) {
        if (!can(message.member, PermissionFlagsBits.ManageRoles)) {
            return message.reply(t(message.guild?.id, 'perm_manage_roles'));
        }
        const [userRaw, ...rest] = args;
        const roleRaw = rest.join(' ').replace(/[<@&!>]/g, '');
        const userId = userRaw?.replace(/[<@!>]/g, '');
        if (!userId || !roleRaw) return message.reply(t(message.guild?.id, 'usage_addrole'));
        try {
            const role = message.guild.roles.cache.get(roleRaw) || await message.guild.roles.fetch(roleRaw).catch(() => null);
            if (!role) return message.reply(t(message.guild?.id, 'role_not_found'));
            const target = message.guild.members.cache.get(userId) || await message.guild.members.fetch(userId).catch(() => null);
            if (!target) return message.reply(t(message.guild?.id, 'user_not_found'));
            if (!canActOn(message.member, target)) return message.reply(t(message.guild?.id, 'cannot_manage_member'));
            if (role.managed) return message.reply(t(message.guild?.id, 'role_integrated_give'));
            if (message.member.roles.highest.comparePositionTo(role) < 0) {
                return message.reply(t(message.guild?.id, 'role_hierarchy_give'));
            }
            await target.roles.add(role, `${message.author.tag} via !addrole`);
            await logModAction(message.guild, 'addrole', `${message.author.tag} -> ${target.user.tag}\nRole: ${role.name}`);
            return message.reply(t(message.guild?.id, 'role_given', { role: (role.name), user: (target.user.tag) }));
        } catch (error) {
            logError('!addrole', error);
            return message.reply(t(message.guild?.id, 'role_give_failed'));
        }
    },
};
