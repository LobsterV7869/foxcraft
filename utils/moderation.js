const { PermissionFlagsBits } = require('discord.js');
const { logModAction } = require('./modlog');
const { t } = require('./lang');

function logError(action, error) {
    console.error(`[FOXCRAFT MOD] ${action} failed:`, JSON.stringify({
        message: error.message,
        code: error.code ?? null,
        status: error.status ?? error.httpStatus ?? null,
    }));
}

/**
 * Permission check that works for both gateway members (Permissions object)
 * and HTTP interaction members (raw permission bit string).
 */
function can(member, permission) {
    if (!member?.permissions) return false;
    if (typeof member.permissions.has === 'function') {
        return member.permissions.has(permission);
    }
    try {
        const bits = BigInt(member.permissions || '0');
        return (bits & BigInt(permission)) === BigInt(permission);
    } catch {
        return false;
    }
}

function getTarget(guild, id) {
    return guild.members.cache.get(id) || guild.members.fetch(id);
}

function canActOn(actor, target) {
    return target && target.id !== actor.id && target.id !== actor.guild.ownerId &&
        target.roles.highest.position < actor.roles.highest.position;
}

/**
 * Builds a standard moderation command (ban/kick-style) with a mod-log entry.
 */
function buildUserCommand(name, permission, action, success, ephemeralReply, logTitle = name) {
    const { SlashCommandBuilder } = require('discord.js');
    const { getOption } = require('./interaction');
    return {
        data: new SlashCommandBuilder()
            .setName(name)
            .setDescription(`Manages a member with the ${name} action`)
            .addUserOption((option) => option.setName('user').setDescription('Target member').setRequired(true))
            .addStringOption((option) => option.setName('reason').setDescription('Reason').setRequired(false)),
        async execute(interaction) {
            if (!can(interaction.member, permission)) return ephemeralReply(t(interaction.guild_id, 'no_permission'));
            try {
                const guild = await interaction.discordClient.guilds.fetch(interaction.guild_id);
                const actor = await guild.members.fetch(interaction.user?.id || interaction.member?.user?.id);
                const target = await getTarget(guild, getOption(interaction, 'user'));
                if (!canActOn(actor, target)) return ephemeralReply(t(interaction.guild_id, 'cannot_manage_member'));
                const reason = getOption(interaction, 'reason') || t(interaction.guild_id, 'mod_no_reason');
                await action(target, reason);
                await logModAction(guild, logTitle, `${actor.user.tag} -> ${target.user.tag}\nReason: ${reason}`);
                return ephemeralReply(success(target.user.tag));
            } catch (error) {
                logError(`/${name}`, error);
                return ephemeralReply(t(interaction.guild_id, 'action_failed', { name }));
            }
        },
        async prefixExecute(message, args) {
            if (!can(message.member, permission)) return message.reply(t(message.guild?.id, 'no_permission'));
            const targetId = args[0]?.replace(/[<@!>]/g, '');
            const reason = args.slice(1).join(' ') || t(message.guild?.id, 'mod_no_reason');
            if (!targetId) return message.reply(t(message.guild?.id, 'usage_action', { name }));
            try {
                const target = await getTarget(message.guild, targetId);
                if (!canActOn(message.member, target)) return message.reply(t(message.guild?.id, 'cannot_manage_member'));
                await action(target, reason);
                await logModAction(message.guild, logTitle, `${message.author.tag} -> ${target.user.tag}\nReason: ${reason}`);
                return message.reply(success(target.user.tag));
            } catch (error) {
                logError(`!${name}`, error);
                return message.reply(t(message.guild?.id, 'action_failed', { name }));
            }
        },
    };
}

module.exports = { PermissionFlagsBits, can, canActOn, getTarget, logError, buildUserCommand };