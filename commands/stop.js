const { SlashCommandBuilder } = require('discord.js');
const { ephemeralReply } = require('../utils/interaction');
const music = require('../utils/music');

function idle() {
    return { content: 'Nothing is playing right now.' };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Stops playback, clears the queue and leaves the voice channel'),
    aliases: ['leave', 'disconnect', 'dc'],
    async execute(interaction) {
        const stopped = music.stop(interaction.guildId);
        return ephemeralReply(stopped ? '🛑 Playback stopped and the voice channel was left.' : idle().content);
    },
    async prefixExecute(message) {
        const stopped = music.stop(message.guildId);
        return message.reply(stopped ? '🛑 Playback stopped and the voice channel was left.' : idle().content);
    },
};
