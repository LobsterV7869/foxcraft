const { SlashCommandBuilder } = require('discord.js');
const { ephemeralReply, getOption } = require('../utils/interaction');
const { PermissionFlagsBits, can, getTarget, logError } = require('../utils/moderation');
const { getWarnings } = require('../utils/db');
const { foxcraftEmbed } = require('../utils/foxcraft');

const { t } = require('../utils/lang');

const STAMP = (ms) => `<t:${Math.floor(ms / 1000)}:f>`;

function warningsEmbed(member, warnings, guildId) {
    // The list is newest-first while the ids run oldest-first, so the position
    // in this list is NOT the id. Print the real id: removewarn deletes by id.
    const lines = warnings.slice(0, 10).map((w) =>
        `**#${w.id}** ${w.reason || t(guildId, 'mod_no_reason')}\n${STAMP(w.created_at)} • ${w.moderator || t(guildId, 'common_unknown')}`);
    const hidden = warnings.length - Math.min(warnings.length, 10);
    const more = hidden > 0 ? `\n\n${t(guildId, 'warnings_more', { count: hidden })}` : '';
    return {
        ...foxcraftEmbed(t(guildId, 'warnings_title_line') + ` ${member.user.tag}`, (lines.join('\n') || t(guildId, 'warnings_none')) + more),
        footer: { text: t(guildId, 'warnings_footer', { count: warnings.length }) },
    };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('warnings')
        .setDescription('Lists the warnings a member has received')
        .addUserOption((option) => option.setName('user').setDescription('Target member').setRequired(true)),
    aliases: ['warns'],
    async execute(interaction) {
        if (!can(interaction.member, PermissionFlagsBits.ModerateMembers)) {
            return ephemeralReply(t(interaction.guild_id, 'no_permission'));
        }
        try {
            const guild = await interaction.discordClient.guilds.fetch(interaction.guild_id);
            const target = await getTarget(guild, getOption(interaction, 'user'));
            const warnings = getWarnings(guild.id, target.id);
            return ephemeralReply(null, [warningsEmbed(target, warnings, interaction.guild_id)]);
        } catch (error) {
            logError('/warnings', error);
            return ephemeralReply(t(interaction.guild_id, 'warnings_failed'));
        }
    },
    async prefixExecute(message, args) {
        if (!can(message.member, PermissionFlagsBits.ModerateMembers)) {
            return message.reply(t(message.guild?.id, 'no_permission'));
        }
        const targetId = args[0]?.replace(/[<@!>]/g, '');
        if (!targetId) return message.reply(t(message.guild?.id, 'usage_warnings'));
        try {
            const target = await getTarget(message.guild, targetId);
            const warnings = getWarnings(message.guild.id, target.id);
            return message.reply({ embeds: [warningsEmbed(target, warnings, message.guild?.id)] });
        } catch (error) {
            logError('!warnings', error);
            return message.reply(t(message.guild?.id, 'warnings_failed'));
        }
    },
};
