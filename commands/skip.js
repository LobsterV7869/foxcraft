const { SlashCommandBuilder } = require('discord.js');
const { ephemeralReply } = require('../utils/interaction');
const { logError } = require('../utils/moderation');
const music = require('../utils/music');

const { t } = require('../utils/lang');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Skips the current track'),
    async execute(interaction) {
        const track = await music.skip(interaction.guildId);
        if (!track) return ephemeralReply(t(interaction.guild_id, 'nothing_playing'));
        return ephemeralReply(t(interaction.guild_id, 'skipped_now', { title: (track.title) }));
    },
    async prefixExecute(message) {
        try {
            const track = await music.skip(message.guildId);
            if (!track) return message.reply(t(message.guild?.id, 'nothing_playing'));
            return message.reply(t(message.guild?.id, 'skipped_now', { title: (track.title) }));
        } catch (error) {
            logError('!skip', error);
            return message.reply(t(message.guild?.id, 'skip_failed'));
        }
    },
};
