const { SlashCommandBuilder } = require('discord.js');
const { ephemeralReply } = require('../utils/interaction');
const music = require('../utils/music');

const { t } = require('../utils/lang');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('replay')
        .setDescription('Plays the current track from the beginning'),
    async execute(interaction) {
        const started = await music.replay(interaction.guildId);
        if (!started) return ephemeralReply(t(interaction.guild_id, 'nothing_playing'));
        return ephemeralReply(t(interaction.guild_id, 'replaying'));
    },
    async prefixExecute(message) {
        const started = await music.replay(message.guildId);
        if (!started) return message.reply(t(message.guild?.id, 'nothing_playing'));
        return message.reply(t(message.guild?.id, 'replaying'));
    },
};
