const { SlashCommandBuilder } = require('discord.js');
const { ephemeralReply, getOption } = require('../utils/interaction');
const { setAfk, clearAfk } = require('../utils/db');
const { t } = require('../utils/lang');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('afk')
        .setDescription('Sets or clears your AFK status')
        .addStringOption((option) => option.setName('reason').setDescription('AFK reason').setMaxLength(200).setRequired(false)),
    async execute(interaction) {
        const guildId = interaction.guild_id;
        const userId = interaction.user?.id || interaction.member?.user?.id;
        const reason = getOption(interaction, 'reason') || getOption(interaction, 'sebeb') || t(guildId, 'mod_no_reason');
        setAfk(guildId, userId, reason);
        return ephemeralReply(t(guildId, 'afk_set', { reason }));
    },
    async prefixExecute(message, args) {
        const guildId = message.guild?.id;
        const reason = args.join(' ') || t(guildId, 'mod_no_reason');
        setAfk(guildId, message.author.id, reason);
        return message.reply(t(guildId, 'afk_set', { reason }));
    },
};
