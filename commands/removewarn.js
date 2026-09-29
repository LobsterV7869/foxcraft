const { SlashCommandBuilder } = require('discord.js');
const { ephemeralReply, getOption } = require('../utils/interaction');
const { PermissionFlagsBits, can, getTarget, logError } = require('../utils/moderation');
const { logModAction } = require('../utils/modlog');
const { removeWarning, clearWarnings } = require('../utils/db');

const { t } = require('../utils/lang');

async function applyRemoval(guild, target, warningId) {
    if (warningId) {
        if (!removeWarning(guild.id, target.id, warningId)) {
            return `That warning does not exist for ${target.user.tag} (id must come from \`/warnings\`).`;
        }
        return `Removed warning #${warningId} from ${target.user.tag}.`;
    }
    const removed = clearWarnings(guild.id, target.id);
    return removed
        ? `Cleared all ${removed} warnings from ${target.user.tag}.`
        : `${target.user.tag} has no warnings to clear.`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('removewarn')
        .setDescription('Removes one warning by id, or all warnings when no id is given')
        .addUserOption((option) => option.setName('user').setDescription('Target member').setRequired(true))
        .addIntegerOption((option) => option.setName('id').setDescription('Warning id to remove').setRequired(false)),
    aliases: ['delwarn', 'clearwarn'],
    async execute(interaction) {
        if (!can(interaction.member, PermissionFlagsBits.ModerateMembers)) {
            return ephemeralReply(t(interaction.guild_id, 'no_permission'));
        }
        try {
            const guild = await interaction.discordClient.guilds.fetch(interaction.guild_id);
            const actor = await guild.members.fetch(interaction.user?.id || interaction.member?.user?.id);
            const target = await getTarget(guild, getOption(interaction, 'user'));
            const result = await applyRemoval(guild, target, getOption(interaction, 'id'));
            await logModAction(guild, 'warn', `${actor.user.tag} -> ${target.user.tag}\n${result}`);
            return ephemeralReply(result);
        } catch (error) {
            logError('/removewarn', error);
            return ephemeralReply(t(interaction.guild_id, 'warn_remove_failed'));
        }
    },
    async prefixExecute(message, args) {
        if (!can(message.member, PermissionFlagsBits.ModerateMembers)) {
            return message.reply(t(message.guild?.id, 'no_permission'));
        }
        const targetId = args[0]?.replace(/[<@!>]/g, '');
        if (!targetId) return message.reply(t(message.guild?.id, 'usage_removewarn'));
        const warningId = Number(args[1]);
        try {
            const target = await getTarget(message.guild, targetId);
            const result = await applyRemoval(message.guild, target, Number.isInteger(warningId) ? warningId : null);
            await logModAction(message.guild, 'warn', `${message.author.tag} -> ${target.user.tag}\n${result}`);
            return message.reply(result);
        } catch (error) {
            logError('!removewarn', error);
            return message.reply(t(message.guild?.id, 'warn_remove_failed'));
        }
    },
};
