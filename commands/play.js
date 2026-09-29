const { SlashCommandBuilder } = require('discord.js');
const { ephemeralReply, getStringOption } = require('../utils/interaction');
const { logError } = require('../utils/moderation');
const { deleteLater } = require('../utils/foxcraft');
const music = require('../utils/music');

const { t } = require('../utils/lang');

const FAILURES = {
    search: 'The track could not be looked up. Try a different title or a direct link.',
    notfound: 'No matching track was found.',
    queuefull: `The queue is full (${music.MAX_QUEUE} tracks).`,
    stream: 'The audio stream could not be opened. The track may be region-locked or unavailable.',
};

function voiceChannelOf(actor) {
    return actor?.member?.voice?.channel || null;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Plays a YouTube track in your voice channel')
        .addStringOption((option) => option.setName('query').setDescription('Title, search term or YouTube link').setRequired(true)),
    aliases: ['p'],
    async execute(interaction) {
        const query = getStringOption(interaction, 'query') || getStringOption(interaction, 'axtarış');
        const voiceChannel = voiceChannelOf(interaction);
        if (!voiceChannel) return ephemeralReply(t(interaction.guild_id, 'play_join_first'));

        await interaction.deferReply();
        try {
            const result = await music.play({
                query,
                voiceChannel,
                textChannel: interaction.channel,
                requestedBy: interaction.user.tag,
            });
            if (!result.ok) return interaction.editReply(FAILURES[result.reason] || 'The track could not be played.');
            const position = result.queued ? ` — növbədə **${result.position}**-ci yer` : '';
            return interaction.editReply(`🔊 **${result.track.title}**${position}`);
        } catch (error) {
            logError('/play', error);
            return interaction.editReply(FAILURES.stream);
        }
    },
    async prefixExecute(message, args) {
        const query = args.join(' ').trim();
        if (!query) return message.reply(t(message.guild?.id, 'usage_play'));
        const voiceChannel = message.member?.voice?.channel;
        if (!voiceChannel) return message.reply(t(message.guild?.id, 'play_join_first'));

        const notice = await message.channel.send(t(message.guild?.id, 'play_searching')).catch(() => null);
        try {
            const result = await music.play({
                query,
                voiceChannel,
                textChannel: message.channel,
                requestedBy: message.author.tag,
            });
            if (notice) await notice.delete().catch(() => {});
            if (!result.ok) return message.reply(FAILURES[result.reason] || 'The track could not be played.');
            const position = result.queued ? ` — növbədə **${result.position}**-ci yer` : '';
            const confirmation = await message.channel.send(`🔊 **${result.track.title}**${position}`);
            deleteLater(confirmation, 5000);
        } catch (error) {
            logError('!play', error);
            if (notice) await notice.delete().catch(() => {});
            return message.reply(FAILURES.stream);
        }
    },
};
