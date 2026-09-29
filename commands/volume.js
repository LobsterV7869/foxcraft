const { SlashCommandBuilder } = require('discord.js');
const { ephemeralReply, getOption } = require('../utils/interaction');
const music = require('../utils/music');

const { t } = require('../utils/lang');

const FAILURES = {
    idle: 'Nothing is playing right now.',
    range: `Volume must be between 0 and ${music.MAX_VOLUME}.`,
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('volume')
        .setDescription('Changes the playback volume')
        .addIntegerOption((option) => option
            .setName('level')
            .setDescription(`Volume between 0 and ${music.MAX_VOLUME}`)
            .setMinValue(0)
            .setMaxValue(music.MAX_VOLUME)
            .setRequired(true)),
    aliases: ['vol', 'səs'],
    async execute(interaction) {
        const result = music.setVolume(interaction.guildId, getOption(interaction, 'level'));
        if (!result.ok) return ephemeralReply(FAILURES[result.reason] || 'The volume could not be changed.');
        return ephemeralReply(t(interaction.guild_id, 'volume_set', { volume: (result.volume) }));
    },
    async prefixExecute(message, args) {
        const result = music.setVolume(message.guildId, args[0]);
        if (!result.ok) return message.reply(FAILURES[result.reason] || 'The volume could not be changed.');
        return message.reply(t(message.guild?.id, 'volume_set', { volume: (result.volume) }));
    },
};
