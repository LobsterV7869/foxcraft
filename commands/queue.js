const { SlashCommandBuilder } = require('discord.js');
const { ephemeralReply } = require('../utils/interaction');
const music = require('../utils/music');

const { t } = require('../utils/lang');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Shows the tracks queued for playback'),
    aliases: ['q'],
    async execute(interaction) {
        const embed = music.queueEmbed(interaction.guildId);
        return ephemeralReply(embed ? null : t(interaction.guild_id, 'nothing_playing'), embed ? [embed] : null);
    },
    async prefixExecute(message) {
        const embed = music.queueEmbed(message.guildId);
        if (!embed) return message.reply(t(message.guild?.id, 'nothing_playing'));
        return message.reply({ embeds: [embed] });
    },
};
