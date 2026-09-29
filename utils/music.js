/**
 * Voice music player.
 *
 * One queue per guild, built on @discordjs/voice. Audio comes from YouTube via
 * @distube/ytdl-core, which hands back a raw webm/opus stream that @discordjs/voice
 * demuxes in pure JS, so no FFmpeg binary is required on the host.
 *
 * Encoding does need the native @discordjs/opus module. prism-media resolves it
 * lazily when the first packet is encoded, so a missing encoder only breaks
 * playback — never boot.
 *
 * Every public function is defensive about missing permissions and unreachable
 * streams: a music failure must never bubble up into a gateway event handler.
 */

const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    NoSubscriberBehavior,
    VoiceConnectionStatus,
} = require('@discordjs/voice');
const ytdl = require('@distube/ytdl-core');
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { foxcraftEmbed, deleteLater } = require('./foxcraft');
const { t } = require('./lang');

/** guildId -> session */
const sessions = new Map();

const MAX_QUEUE = 100;
const MAX_VOLUME = 100;
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_VOLUME = 40;

const LoopMode = { OFF: 'off', TRACK: 'track', QUEUE: 'queue' };

function session(guildId) {
    return sessions.get(guildId) || null;
}

function humanDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return 'live';
    const total = Math.round(seconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

function isPlayable(track) {
    return Boolean(track?.url);
}

function trackLine(track, index) {
    const position = index === undefined ? '' : `**${index + 1}.** `;
    const duration = track.duration ? ` \`${humanDuration(track.duration)}\`` : '';
    return `${position}[${track.title}](${track.url}) — ${track.requestedBy}${duration}`;
}

/** Normalises any ytdl info object into the shape the queue stores. */
function toTrack(info, requestedBy) {
    const details = info.videoDetails || {};
    return {
        title: details.title || 'Unknown track',
        url: details.video_url || info.url,
        duration: details.lengthSeconds ? Number(details.lengthSeconds) : null,
        thumbnail: details.thumbnail?.url || null,
        requestedBy,
    };
}

/**
 * Resolves a query or URL into a single track.
 * A plain search term is expanded to its first result; a bare query is run
 * through YouTube search which returns the best match.
 */
async function search(query) {
    const trimmed = String(query || '').trim();
    if (!trimmed) return null;

    if (/^https?:\/\//i.test(trimmed)) {
        const info = await ytdl.getInfo(trimmed);
        return toTrack(info, '');
    }

    const pattern = /^yt(?:s|search)?:\s*(.+)$/i.exec(trimmed);
    const searchTerm = pattern ? pattern[1] : trimmed;
    const info = await ytdl.search(searchTerm, { type: 'video', limit: 1 });
    if (!info || info.length === 0) return null;
    return toTrack(info[0], '');
}

/** Joins (or reuses) the caller's voice channel and returns the session. */
async function join(voiceChannel) {
    if (!voiceChannel || !voiceChannel.joinable) {
        throw new Error(t(voiceChannel.guild?.id, 'cannot_join'));
    }
    // Checked up front so the user gets a readable reason instead of the
    // connection dying later with an opaque "cannot speak" gateway error.
    const me = voiceChannel.guild.members.me;
    const perms = me ? voiceChannel.permissionsFor(me) : null;
    if (perms && (!perms.has(PermissionFlagsBits.Connect) || !perms.has(PermissionFlagsBits.Speak))) {
        throw new Error(t(voiceChannel.guild?.id, 'need_connect_speak'));
    }

    let state = sessions.get(voiceChannel.guild.id);
    if (state) {
        if (state.connection.state.status === VoiceConnectionStatus.Destroyed
            || state.connection.joinConfig.channelId !== voiceChannel.id) {
            try {
                state.connection.destroy();
            } catch {
                /* already gone */
            }
            state = null;
            sessions.delete(voiceChannel.guild.id);
        }
    }

    if (!state) {
        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: voiceChannel.guild.id,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator,
            selfDeaf: false,
        });

        const player = createAudioPlayer({
            behaviors: NoSubscriberBehavior.Pause,
            volume: DEFAULT_VOLUME / 100,
        });

        state = {
            guildId: voiceChannel.guild.id,
            connection,
            player,
            queue: [],
            current: null,
            volume: DEFAULT_VOLUME,
            loop: LoopMode.OFF,
            textChannel: null,
            idleTimer: null,
        };
        sessions.set(voiceChannel.guild.id, state);
        wireEvents(state, voiceChannel.guild);
    }

    // A user who left and came back resets the idle countdown.
    armIdleTimeout(state);
    return state;
}

function armIdleTimeout(state) {
    if (state.idleTimer) clearTimeout(state.idleTimer);
    state.idleTimer = setTimeout(() => {
        if (!state.current && state.queue.length === 0) destroy(state.guildId);
    }, IDLE_TIMEOUT_MS);
    state.idleTimer.unref?.();
}

function teardown(state) {
    if (state.idleTimer) clearTimeout(state.idleTimer);
    try {
        state.player.stop();
    } catch {
        /* nothing playing */
    }
    try {
        state.connection.destroy();
    } catch {
        /* already destroyed */
    }
}

function destroy(guildId) {
    const state = sessions.get(guildId);
    if (!state) return false;
    teardown(state);
    sessions.delete(guildId);
    return true;
}

/** Streams a track into the player. Any stream error resolves instead of throwing. */
function startResource(state, track) {
    return new Promise((resolve) => {
        let stream;
        try {
            stream = ytdl(track.url, {
                quality: 'highestaudio',
                highWaterMark: 1 << 25,
            });
        } catch (error) {
            console.error('[MUSIC] Stream could not be created:', error.message);
            resolve(false);
            return;
        }

        let settled = false;
        const done = (value) => {
            if (settled) return;
            settled = true;
            resolve(value);
        };

        stream.on('error', (error) => {
            console.error('[MUSIC] Stream error:', error.message);
            done(false);
        });

        let resource;
        try {
            resource = createAudioResource(stream, {
                inlineVolume: true,
                volume: state.volume / 100,
            });
        } catch (error) {
            console.error('[MUSIC] Encoder unavailable:', error.message);
            stream.destroy();
            done(false);
            return;
        }

        state.current = track;
        state.player.play(resource);
        done(true);
    });
}

function announce(state, track) {
    const channel = state.textChannel;
    if (!channel || !channel.isTextBased() || !channel.send) return;
    const embed = foxcraftEmbed('Now Playing', trackLine(track));
    if (track.thumbnail) embed.thumbnail = { url: track.thumbnail };
    channel.send({ embeds: [embed] })
        .then((message) => deleteLater(message, 7000))
        .catch(() => {});
}

/** Moves to the next queued track, honouring loop mode. */
async function advance(state) {
    if (state.loop === LoopMode.TRACK && state.current) {
        state.queue.unshift(state.current);
    } else if (state.loop === LoopMode.QUEUE && state.current) {
        state.queue.push(state.current);
    } else {
        state.current = null;
    }

    const next = state.queue.shift();
    if (!next) {
        state.current = null;
        try {
            state.player.stop();
        } catch {
            /* already stopped */
        }
        armIdleTimeout(state);
        return null;
    }

    const started = await startResource(state, next);
    if (!started) {
        announce(state, next);
        return advance(state);
    }
    announce(state, next);
    armIdleTimeout(state);
    return next;
}

function wireEvents(state, guild) {
    state.connection.on(VoiceConnectionStatus.Destroyed, () => {
        sessions.delete(guild.id);
    });

    state.connection.on(VoiceConnectionStatus.Disconnected, async () => {
        // Discord briefly reports Disconnected during region handovers; only give
        // up once the connection has not recovered shortly after.
        try {
            await Promise.race([
                new Promise((resolve) => state.connection.once(VoiceConnectionStatus.Ready, resolve)),
                new Promise((resolve) => setTimeout(resolve, 20_000)),
            ]);
            if (state.connection.state.status === VoiceConnectionStatus.Disconnected) {
                sessions.delete(guild.id);
            }
        } catch {
            sessions.delete(guild.id);
        }
    });

    state.player.on('error', (error) => {
        console.error('[MUSIC] Player error:', error.message);
    });

    state.player.on('stateChange', (oldState, newState) => {
        if (oldState.status !== 'idle' || newState.status !== 'idle') return;
        if (!state.current && state.queue.length === 0) {
            armIdleTimeout(state);
            return;
        }
        advance(state).catch((error) => console.error('[MUSIC] Advance failed:', error.message));
    });
}

/**
 * Resolves a query, joins the caller's channel and queues the result.
 * Returns a status object rather than throwing so callers stay simple.
 */
async function play({ query, voiceChannel, textChannel, requestedBy }) {
    const state = await join(voiceChannel);
    state.textChannel = textChannel || voiceChannel.guild.channels.cache.find((c) => c.id === state.connection.joinConfig.channelId);

    let track;
    try {
        track = await search(query);
    } catch (error) {
        console.error('[MUSIC] Search failed:', error.message);
        return { ok: false, reason: 'search' };
    }
    if (!track || !isPlayable(track)) return { ok: false, reason: 'notfound' };
    track.requestedBy = requestedBy;

    if (state.current) {
        if (state.queue.length >= MAX_QUEUE) return { ok: false, reason: 'queuefull' };
        state.queue.push(track);
        return { ok: true, queued: true, track, position: state.queue.length };
    }

    const started = await startResource(state, track);
    if (!started) return { ok: false, reason: 'stream' };
    announce(state, track);
    armIdleTimeout(state);
    return { ok: true, queued: false, track, queue: state.queue.length };
}

async function skip(guildId) {
    const state = sessions.get(guildId);
    if (!state || !state.current) return null;
    state.loop = LoopMode.OFF;
    return advance(state);
}

function stop(guildId) {
    const state = sessions.get(guildId);
    if (!state) return false;
    destroy(guildId);
    return true;
}

function setVolume(guildId, raw) {
    const state = sessions.get(guildId);
    if (!state) return { ok: false, reason: 'idle' };
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0 || value > MAX_VOLUME) {
        return { ok: false, reason: 'range' };
    }
    state.volume = value;
    state.player.volume?.setVolume(value / 100);
    const resource = state.player.state?.resource;
    if (resource?.volume) resource.volume.setVolume(value / 100);
    return { ok: true, volume: value };
}

function setLoop(guildId, mode) {
    const state = sessions.get(guildId);
    if (!state) return { ok: false, reason: 'idle' };
    const normalized = String(mode || '').toLowerCase();
    if (!Object.values(LoopMode).includes(normalized)) return { ok: false, reason: 'mode' };
    state.loop = normalized;
    return { ok: true, loop: normalized };
}

async function replay(guildId) {
    const state = sessions.get(guildId);
    if (!state || !state.current) return null;
    return startResource(state, state.current);
}

function queueEmbed(guildId) {
    const state = sessions.get(guildId);
    if (!state) return null;
    const lines = [];
    if (state.current) lines.push(trackLine(state.current));
    state.queue.slice(0, 10).forEach((track, index) => lines.push(trackLine(track, index)));
    return {
        ...foxcraftEmbed(t(guildId, 'queue_title'), lines.join('\n') || t(guildId, 'queue_empty')),
        footer: {
            text: t(guildId, 'queue_footer', { count: state.queue.length, volume: state.volume, loop: state.loop }),
        },
    };
}

/**
 * Resolves a voice channel from an id, a #mention or a (partial) name.
 * Returns null when nothing matches, so callers can tell "not found" from
 * "found but not permitted".
 */
function findVoiceChannel(guild, query) {
    if (!guild) return null;
    const channels = guild.channels.cache.filter((c) =>
        c.type === ChannelType.GuildVoice || c.type === ChannelType.StageVoice);
    if (!query) return null;
    const bare = String(query).replace(/[<#>]/g, '').trim();
    const lower = bare.toLowerCase();
    return channels.find((c) => c.id === bare)
        || channels.find((c) => c.name.toLowerCase() === lower)
        || channels.find((c) => c.name.toLowerCase().includes(lower))
        || null;
}

module.exports = {
    LoopMode,
    MAX_QUEUE,
    MAX_VOLUME,
    DEFAULT_VOLUME,
    humanDuration,
    findVoiceChannel,
    session,
    search,
    join,
    play,
    skip,
    stop,
    destroy,
    setVolume,
    setLoop,
    replay,
    queueEmbed,
};
