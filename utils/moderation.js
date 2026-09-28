const { PermissionFlagsBits } = require('discord.js');
const { logModAction } = require('./modlog');

function logError(action, error) {
    console.error(`[FOXCRAFT MOD] ${action} uğursuz oldu:`, JSON.stringify({
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
            .setDescription(`Üzvü ${name} əməliyyatı ilə idarə edir`)
            .addUserOption((option) => option.setName('user').setDescription('Hədəf üzv').setRequired(true))
            .addStringOption((option) => option.setName('reason').setDescription('Səbəb').setRequired(false)),
        async execute(interaction) {
            if (!can(interaction.member, permission)) return ephemeralReply('Bu əmrlə işləmək üçün lazımi icazə yoxdur.');
            try {
                const guild = await interaction.discordClient.guilds.fetch(interaction.guild_id);
                const actor = await guild.members.fetch(interaction.user?.id || interaction.member?.user?.id);
                const target = await getTarget(guild, getOption(interaction, 'user'));
                if (!canActOn(actor, target)) return ephemeralReply('Bu üzvü idarə edə bilməzsən: rol iyerarxiyasını yoxla.');
                const reason = getOption(interaction, 'reason') || 'Səbəb göstərilməyib.';
                await action(target, reason);
                await logModAction(guild, logTitle, `${actor.user.tag} → ${target.user.tag}\nSəbəb: ${reason}`);
                return ephemeralReply(success(target.user.tag));
            } catch (error) {
                logError(`/${name}`, error);
                return ephemeralReply(`${name} əməliyyatı həyata keçirilmədi.`);
            }
        },
        async prefixExecute(message, args) {
            if (!can(message.member, permission)) return message.reply('Bu əmrlə işləmək üçün lazımi icazə yoxdur.');
            const targetId = args[0]?.replace(/[<@!>]/g, '');
            const reason = args.slice(1).join(' ') || 'Səbəb göstərilməyib.';
            if (!targetId) return message.reply(`İstifadə: \`!${name} @üzv [səbəb]\``);
            try {
                const target = await getTarget(message.guild, targetId);
                if (!canActOn(message.member, target)) return message.reply('Bu üzvü idarə edə bilməzsən: rol iyerarxiyasını yoxla.');
                await action(target, reason);
                await logModAction(message.guild, logTitle, `${message.author.tag} → ${target.user.tag}\nSəbəb: ${reason}`);
                return message.reply(success(target.user.tag));
            } catch (error) {
                logError(`!${name}`, error);
                return message.reply(`${name} əməliyyatı həyata keçirilmədi.`);
            }
        },
    };
}

module.exports = { PermissionFlagsBits, can, canActOn, getTarget, logError, buildUserCommand };