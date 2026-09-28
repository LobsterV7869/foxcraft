const DEFAULT_CONFIG = {
  overview: {
    prefix: '!',
    language: 'az',
    timezone: 'UTC',
  },
  setup: {
    adminRoles: [],
    modRoles: [],
    mutedRole: '',
  },
  features: {
    leveling: true,
    tickets: true,
    fun: true,
    moderation: true,
    security: true,
  },
  server: {
    language: 'az',
    welcome: {
      enabled: false,
      channel: '',
      message: 'FoxCraft serverinə xoş gəlmisən, {user}!',
    },
    autoRole: {
      enabled: false,
      roles: [],
    },
    tagSync: {
      enabled: false,
    },
    voice: {
      enabled: false,
      channel: '',
    },
  },
  members: {
    users: [],
    infractions: [],
    invites: [],
  },
  leveling: {
    enabled: true,
    xpRate: 1.0,
    cooldown: 60,
    levelUpChannel: 'current',
    levelUpMessage: '{user}, {level} səviyyəsinə yüksəldin!',
    roles: [],
  },
  security: {
    guard: { enabled: false },
    filter: { enabled: false, words: [] },
    antiFlood: { enabled: false, threshold: 5, cooldown: 3 },
    antiSpam: { enabled: false, maxDuplicates: 3 },
  },
  logs: {
    eventLogs: { enabled: false, channel: '' },
    panelLogs: { enabled: false, channel: '' },
  },
  tickets: {
    enabled: true,
    category: '',
    settings: {
      limit: 1,
      claim: true,
    },
    reviews: { enabled: false, channel: '' },
    hours: { enabled: false, start: '09:00', end: '17:00' },
    inactivity: { enabled: false, hours: 24 },
  },
  fun: {
    counting: { enabled: false, channel: '' },
    wordGame: { enabled: false, channel: '' },
    confessions: { enabled: false, channel: '' },
    autoReplies: [],
  },
  tools: {
    embedSender: {},
    announce: {},
    rawConfig: {},
  },
};

// Serverless instances are ephemeral, so the in-memory Map is only a cache.
// It is seeded on startup and refreshed on read, but MongoDB is the source of
// truth: anything relying on the cache alone silently loses every saved change
// the moment the process restarts.
const mongoose = require('mongoose');

const GuildConfigSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    config: { type: mongoose.Schema.Types.Mixed, default: {} },
    updatedAt: { type: Date, default: Date.now }
});

const GuildConfig = mongoose.models.GuildConfig || mongoose.model('GuildConfig', GuildConfigSchema);

const guildConfigs = new Map();

function mongoReady() {
    return mongoose.connection?.readyState === 1;
}

/**
 * Merges a stored config over the defaults. A shallow spread is not enough,
 * because a config saved before a new field existed would otherwise leave that
 * field undefined instead of falling back to its default.
 */
function withDefaults(stored) {
    const merge = (base, patch) => {
        const result = structuredClone(base);
        if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return result;
        for (const [key, value] of Object.entries(patch)) {
            result[key] = value && typeof value === 'object' && !Array.isArray(value)
                ? merge(result[key] ?? {}, value)
                : value;
        }
        return result;
    };
    return merge(DEFAULT_CONFIG, stored);
}

/**
 * Retrieves the current configuration for a specific guild.
 * Synchronous and cache-backed on purpose: this runs inside interaction handlers
 * and cannot await. Use loadGuildConfig when you need to be certain the value is
 * current, such as from an admin endpoint.
 */
function getGuildConfig(guildId) {
    if (!guildId) return structuredClone(DEFAULT_CONFIG);

    try {
        if (!guildConfigs.has(guildId)) {
            guildConfigs.set(guildId, structuredClone(DEFAULT_CONFIG));
        }
        return structuredClone(guildConfigs.get(guildId));
    } catch (error) {
        console.error(`Failed to get guild config for ${guildId}:`, error);
        return structuredClone(DEFAULT_CONFIG);
    }
}

/**
 * Reads the authoritative config from MongoDB, refreshing the cache.
 * Falls back to the cached value when Mongo is unreachable so the bot keeps
 * running with the settings it already has.
 */
async function loadGuildConfig(guildId) {
    if (!guildId) return structuredClone(DEFAULT_CONFIG);

    if (!mongoReady()) return getGuildConfig(guildId);

    try {
        const row = await GuildConfig.findOne({ guildId }).lean();
        const config = withDefaults(row?.config);
        guildConfigs.set(guildId, config);
        return structuredClone(config);
    } catch (error) {
        console.error(`Failed to load guild config for ${guildId}:`, error);
        return getGuildConfig(guildId);
    }
}

/**
 * Deep-merges a partial update into the stored config and persists it.
 * Merging rather than replacing means saving one section never wipes the rest.
 * Returns the full saved config, or null when the write could not be made.
 */
async function setGuildConfig(guildId, patch) {
    if (!guildId || !patch || typeof patch !== 'object' || Array.isArray(patch)) return null;

    const current = mongoReady()
        ? (await GuildConfig.findOne({ guildId }).lean())?.config || {}
        : guildConfigs.get(guildId) || {};
    const merged = withDefaults(current);

    const apply = (base, update) => {
        for (const [key, value] of Object.entries(update)) {
            base[key] = value && typeof value === 'object' && !Array.isArray(value)
                ? apply(base[key] && typeof base[key] === 'object' ? base[key] : {}, value)
                : value;
        }
        return base;
    };
    const next = apply(merged, patch);

    if (mongoReady()) {
        try {
            await GuildConfig.findOneAndUpdate(
                { guildId },
                { config: next, updatedAt: new Date() },
                { upsert: true, setDefaultsOnInsert: true }
            );
        } catch (error) {
            console.error(`Failed to save guild config for ${guildId}:`, error);
            return null;
        }
    }

    guildConfigs.set(guildId, next);
    return structuredClone(next);
}

/** True when a restart would be safe, i.e. config is actually being persisted. */
function configIsDurable() {
    return mongoReady();
}

module.exports = {
    getGuildConfig,
    loadGuildConfig,
    setGuildConfig,
    configIsDurable,
    DEFAULT_CONFIG,
};
