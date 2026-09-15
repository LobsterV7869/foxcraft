const DEFAULT_CONFIG = {
  overview: {
    prefix: '!',
    language: 'en',
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
    language: 'en',
    welcome: {
      enabled: false,
      channel: '',
      message: 'Welcome to the server, {user}!',
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
    levelUpMessage: 'GG {user}, you leveled up to level {level}!',
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

// Serverless instances are ephemeral, so keep only a per-instance cache here.
// Durable guild configuration should use a hosted database when required.
const guildConfigs = new Map();

/**
 * Retrieves the current configuration for a specific guild.
 * Falls back to a fresh default configuration if none exists or the cache fails.
 */
function getGuildConfig(guildId) {
  if (!guildId) return structuredClone(DEFAULT_CONFIG);

  try {
    if (!guildConfigs.has(guildId)) {
      guildConfigs.set(guildId, structuredClone(DEFAULT_CONFIG));
    }
    return guildConfigs.get(guildId);
  } catch (error) {
    console.error(`Failed to get guild config for ${guildId}:`, error);
    return structuredClone(DEFAULT_CONFIG);
  }
}

module.exports = {
  getGuildConfig,
  DEFAULT_CONFIG,
};
