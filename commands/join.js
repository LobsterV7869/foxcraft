const { SlashCommandBuilder } = require('discord.js');
const { ephemeralReply, getOption } = require('../utils/interaction');
const { logError } = require('../utils/moderation');
const music = require('../utils/music');

const { t } = require('../utils/lang');

/**
 * Resolves the target channel: the `channel` option when given (so staff can
 * pull the bot into an empty channel), otherwise the caller's own channel.
 */
function resolveChannel(guild, actor, requested) {
    if (requested) return music.findVoiceChannel(guild, requested);
    return actor?.voice?.channel || null;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('join')
        .setDescription('Joins a voice channel without playing anything')
        .addStringOption((option) => option.setName('channel').setDescription('Voice channel (defaults to yours)').setRequired(false)),
    aliases: ['connect'],
    async execute(interaction) {
        const requested = getOption(interaction, 'channel');
        if (requested && !music.findVoiceChannel(interaction.guild, requested)) {
            return ephemeralReply(t(interaction.guild_id, 'voice_channel_not_found'));
        }
        const voiceChannel = resolveChannel(interaction.guild, interaction.member, requested);
        if (!voiceChannel) return ephemeralReply('Join a voice channel first, or name a channel, then run the command again.');
        try {
            await music.join(voiceChannel);
            return ephemeralReply(t(interaction.guild_id, 'joined_voice', { channel: voiceChannel.name }));
        } catch (error) {
            logError('/join', error);
            return ephemeralReply(error.message || 'The voice channel could not be joined.');
        }
    },
    async prefixExecute(message, args) {
        const requested = args.join(' ').trim();
        if (requested && !music.findVoiceChannel(message.guild, requested)) {
            return message.reply(t(message.guild?.id, 'voice_channel_not_found'));
        }
        const voiceChannel = resolveChannel(message.guild, message.member, requested);
        if (!voiceChannel) return message.reply(t(message.guild?.id, 'join_first'));
        try {
            await music.join(voiceChannel);
            return message.reply(t(message.guild?.id, 'joined_voice', { channel: (voiceChannel.name) }));
        } catch (error) {
            logError('!join', error);
            return message.reply(error.message || 'The voice channel could not be joined.');
        }
    },
};
