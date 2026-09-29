const { SlashCommandBuilder } = require('discord.js');
const { ephemeralReply } = require('../utils/interaction');
const { foxcraftEmbed } = require('../utils/foxcraft');
const music = require('../utils/music');

const { t } = require('../utils/lang');

function nowPlayingEmbed(state, guildId) {
    if (!state?.current) return null;
    const track = state.current;
    const embed = {
        ...foxcraftEmbed(t(guildId, 'nowplaying_title'), `**[${track.title}](${track.url})**\n${t(guildId, 'nowplaying_requested')}: ${track.requestedBy}`),
        footer: {
            text: `${t(guildId, 'np_duration')}: ${music.humanDuration(track.duration)} • ${t(guildId, 'np_volume')}: ${state.volume}% • ${t(guildId, 'np_loop')}: ${state.loop} • ${t(guildId, 'np_queue')}: ${state.queue.length}`,
        },
    };
    if (track.thumbnail) embed.thumbnail = { url: track.thumbnail };
    return embed;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('nowplaying')
        .setDescription('Shows the track that is currently playing'),
    aliases: ['np'],
    async execute(interaction) {
        const embed = nowPlayingEmbed(music.session(interaction.guildId), interaction.guild_id);
        return ephemeralReply(embed ? null : t(interaction.guild_id, 'nothing_playing'), embed ? [embed] : null);
    },
    async prefixExecute(message) {
        const embed = nowPlayingEmbed(music.session(message.guildId), message.guild?.id);
        if (!embed) return message.reply(t(message.guild?.id, 'nothing_playing'));
        return message.reply({ embeds: [embed] });
    },
};
