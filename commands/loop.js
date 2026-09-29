const { SlashCommandBuilder } = require('discord.js');
const { ephemeralReply, getStringOption } = require('../utils/interaction');
const music = require('../utils/music');

const { t } = require('../utils/lang');

const FAILURES = {
    idle: 'Nothing is playing right now.',
    mode: `Mode must be one of: ${Object.values(music.LoopMode).join(', ')}.`,
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('loop')
        .setDescription('Repeats the current track or the whole queue')
        .addStringOption((option) => option
            .setName('mode')
            .setDescription('off, track or queue')
            .setRequired(true)),
    async execute(interaction) {
        const result = music.setLoop(interaction.guildId, getStringOption(interaction, 'mode'));
        if (!result.ok) return ephemeralReply(FAILURES[result.reason] || 'The loop mode could not be changed.');
        return ephemeralReply(t(interaction.guild_id, 'loop_set', { mode: (result.loop) }));
    },
    async prefixExecute(message, args) {
        const result = music.setLoop(message.guildId, args[0]);
        if (!result.ok) return message.reply(FAILURES[result.reason] || 'The loop mode could not be changed.');
        return message.reply(t(message.guild?.id, 'loop_set', { mode: (result.loop) }));
    },
};
