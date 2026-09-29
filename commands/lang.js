const { SlashCommandBuilder } = require('discord.js');
const { ephemeralReply, getOption } = require('../utils/interaction');
const { logError } = require('../utils/moderation');
const { t, currentLang, languageName, setLang, LANGS } = require('../utils/lang');
const { isGuildOwnerOrAdmin } = require('../utils/foxcraft');

const CHOICES = [
    { name: 'English', value: 'en' },
    { name: 'Azerbaijani', value: 'az' },
];

/**
 * isGuildOwnerOrAdmin() reads guild_id + member.permissions, which an
 * interaction has and a Message does not. Adapt the message to that shape
 * instead of duplicating the permission logic here.
 */
function mayManage(message) {
    return isGuildOwnerOrAdmin({
        guild_id: message.guild?.id,
        user: message.user,
        member: message.member,
    }, message.guild);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lang')
        .setDescription('Sets the bot language for this server')
        .addStringOption((option) => option
            .setName('language')
            .setDescription('Language to use')
            .setRequired(false)
            .addChoices(...CHOICES)),
    aliases: ['language', 'dil'],
    async execute(interaction) {
        const guildId = interaction.guild_id;
        if (!guildId) return ephemeralReply(t(null, 'server_only'));
        // Pass the guild through: without it the owner check inside
        // isGuildOwnerOrAdmin() can never match and the owner is refused.
        if (!isGuildOwnerOrAdmin(interaction, interaction.guild)) {
            return ephemeralReply(t(guildId, 'no_permission'));
        }
        const requested = getOption(interaction, 'language');
        try {
            if (!requested) {
                const lang = currentLang(guildId);
                return ephemeralReply(t(guildId, 'lang_current', { lang: languageName(guildId, lang) }));
            }
            const value = String(requested).toLowerCase();
            if (!LANGS.includes(value)) {
                return ephemeralReply(t(guildId, 'lang_invalid', { lang: requested }));
            }
            await setLang(guildId, value);
            return ephemeralReply(t(guildId, 'lang_set', { lang: languageName(guildId, value) }));
        } catch (error) {
            logError('/lang', error);
            return ephemeralReply(t(guildId, 'unexpected_error'));
        }
    },
    async prefixExecute(message, args) {
        const guildId = message.guild?.id;
        if (!guildId) return message.reply(t(null, 'server_only'));
        if (!mayManage(message)) {
            return message.reply(t(guildId, 'no_permission'));
        }
        const requested = args[0]?.toLowerCase();
        try {
            if (!requested) {
                const lang = currentLang(guildId);
                return message.reply(t(guildId, 'lang_current', { lang: languageName(guildId, lang) }));
            }
            if (!LANGS.includes(requested)) {
                return message.reply(t(guildId, 'lang_invalid', { lang: args[0] }));
            }
            await setLang(guildId, requested);
            return message.reply(t(guildId, 'lang_set', { lang: languageName(guildId, requested) }));
        } catch (error) {
            logError('!lang', error);
            return message.reply(t(guildId, 'unexpected_error'));
        }
    },
};
