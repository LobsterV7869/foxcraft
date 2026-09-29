const fs = require('fs');
const path = require('path');

// Mongoose costs ~1s to require and is only ever used when MONGO_URI is set.
// Loading it lazily keeps serverless cold starts inside the 3s interaction budget.
let mongo = null;

/** Requires mongoose and registers the models on first real use. */
function mongoModels() {
    if (mongo) return mongo;
    if (!process.env.MONGO_URI) return null;
    const mongoose = require('mongoose');

    const MinecraftLinkSchema = new mongoose.Schema({
        discordUserId: { type: String, required: true, unique: true },
        minecraftUsername: { type: String, required: true },
        updatedAt: { type: Date, default: Date.now }
    });

    const GameStateSchema = new mongoose.Schema({
        guildId: { type: String, required: true },
        channelId: { type: String, required: true },
        game: { type: String, required: true },
        value: { type: mongoose.Schema.Types.Mixed, required: true },
        updatedAt: { type: Date, default: Date.now }
    });
    GameStateSchema.index({ guildId: 1, channelId: 1, game: 1 }, { unique: true });

    const GuildLogSchema = new mongoose.Schema({
        guildId: { type: String, required: true, unique: true },
        channelId: { type: String, required: true },
        updatedAt: { type: Date, default: Date.now }
    });

    mongo = {
        connection: mongoose.connection,
        MinecraftLink: mongoose.models.MinecraftLink || mongoose.model('MinecraftLink', MinecraftLinkSchema),
        GameState: mongoose.models.GameState || mongoose.model('GameState', GameStateSchema),
        GuildLog: mongoose.models.GuildLog || mongoose.model('GuildLog', GuildLogSchema),
    };
    return mongo;
}

/** True only once mongoose is loaded and its connection is live. */
function mongoReady() {
    return mongo?.connection?.readyState === 1;
}

// In-memory cache for fast, zero-latency retrieval during high-frequency events
const logChannelCache = new Map();

// Local JSON fallback file path
const DATA_DIR = path.join(__dirname, '..', 'data');
const JSON_LOGS_PATH = path.join(DATA_DIR, 'guild-logs.json');

// Initialize local JSON storage if needed
function loadJsonCache() {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        if (fs.existsSync(JSON_LOGS_PATH)) {
            const raw = fs.readFileSync(JSON_LOGS_PATH, 'utf8');
            const data = JSON.parse(raw);
            if (data && typeof data === 'object') {
                for (const [guildId, channelId] of Object.entries(data)) {
                    logChannelCache.set(guildId, String(channelId));
                }
            }
        }
    } catch (error) {
        console.error('[STORAGE] Error loading local JSON log config:', error.message);
    }
}

function saveJsonCache() {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        const obj = Object.fromEntries(logChannelCache.entries());
        fs.writeFileSync(JSON_LOGS_PATH, JSON.stringify(obj, null, 2), 'utf8');
    } catch (error) {
        console.error('[STORAGE] Error saving local JSON log config:', error.message);
    }
}

// SQLite helper (if better-sqlite3 and azespace.db exist)
let sqliteDb = null;
try {
    const Database = require('better-sqlite3');
    const sqlitePath = path.join(__dirname, '..', 'azespace.db');
    sqliteDb = new Database(sqlitePath);
    sqliteDb.exec(`
        CREATE TABLE IF NOT EXISTS guild_log_channels (
            guild_id TEXT PRIMARY KEY,
            channel_id TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);
    // Pre-populate in-memory cache from SQLite
    try {
        const rows = sqliteDb.prepare('SELECT guild_id, channel_id FROM guild_log_channels').all();
        for (const row of rows) {
            logChannelCache.set(row.guild_id, row.channel_id);
        }
    } catch (e) {
        // Ignore table read errors
    }
} catch (e) {
    sqliteDb = null;
}

// Initial JSON cache load (after SQLite so both populate)
loadJsonCache();

async function connectDB() {
    const db = mongoModels();
    if (!db) {
        console.warn('[STORAGE] MONGO_URI is not set. Falling back to SQLite and JSON storage.');
        return;
    }
    try {
        await require('mongoose').connect(process.env.MONGO_URI);
        console.log('[STORAGE] Successfully connected to MongoDB Atlas');

        // Pre-load all GuildLog configs from MongoDB into in-memory cache
        try {
            const logs = await db.GuildLog.find({});
            for (const log of logs) {
                if (log.guildId && log.channelId) {
                    logChannelCache.set(log.guildId, log.channelId);
                }
            }
            console.log(`[STORAGE] Loaded ${logs.length} guild log configs from MongoDB.`);
        } catch (err) {
            console.error('[STORAGE] Error preloading guild log configs from MongoDB:', err.message);
        }
    } catch (error) {
        console.error('[STORAGE] MongoDB connection error:', error.message);
    }
}

async function setLogChannelId(guildId, channelId) {
    if (!guildId) return;

    // 1. Update In-Memory Cache immediately
    if (channelId) {
        logChannelCache.set(guildId, String(channelId));
    } else {
        logChannelCache.delete(guildId);
    }

    // 2. Persist to MongoDB (if connected)
    const db = mongoModels();
    if (mongoReady()) {
        try {
            if (channelId) {
                await db.GuildLog.findOneAndUpdate(
                    { guildId },
                    { channelId: String(channelId), updatedAt: new Date() },
                    { upsert: true, new: true }
                );
            } else {
                await db.GuildLog.deleteOne({ guildId });
            }
        } catch (error) {
            console.error('[STORAGE] MongoDB error saving log channel:', error.message);
        }
    }

    // 3. Persist to SQLite (if available)
    if (sqliteDb) {
        try {
            if (channelId) {
                sqliteDb.prepare(`
                    INSERT INTO guild_log_channels (guild_id, channel_id, updated_at)
                    VALUES (?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(guild_id) DO UPDATE SET channel_id = excluded.channel_id, updated_at = CURRENT_TIMESTAMP
                `).run(guildId, String(channelId));

                // Also keep dashboard guild_configs table in sync if it exists
                try {
                    const row = sqliteDb.prepare('SELECT config FROM guild_configs WHERE guild_id = ?').get(guildId);
                    let config = {};
                    if (row) {
                        try { config = JSON.parse(row.config); } catch {}
                    }
                    if (!config.logs) config.logs = {};
                    config.logs.eventLogs = { enabled: true, channel: String(channelId) };
                    sqliteDb.prepare(`
                        INSERT INTO guild_configs (guild_id, config, updated_at)
                        VALUES (?, ?, CURRENT_TIMESTAMP)
                        ON CONFLICT(guild_id) DO UPDATE SET config = excluded.config, updated_at = CURRENT_TIMESTAMP
                    `).run(guildId, JSON.stringify(config));
                } catch {}
            } else {
                sqliteDb.prepare('DELETE FROM guild_log_channels WHERE guild_id = ?').run(guildId);
            }
        } catch (error) {
            console.error('[STORAGE] SQLite error saving log channel:', error.message);
        }
    }

    // 4. Persist to JSON failsafe file
    saveJsonCache();
}

async function getLogChannelId(guildId) {
    if (!guildId) return null;

    // 1. Check in-memory cache first
    if (logChannelCache.has(guildId)) {
        return logChannelCache.get(guildId);
    }

    // 2. Check MongoDB if connected
    const db = mongoModels();
    if (mongoReady()) {
        try {
            const doc = await db.GuildLog.findOne({ guildId });
            if (doc && doc.channelId) {
                logChannelCache.set(guildId, doc.channelId);
                return doc.channelId;
            }
        } catch (error) {
            console.error('[STORAGE] MongoDB error fetching log channel:', error.message);
        }
    }

    // 3. Check SQLite if available
    if (sqliteDb) {
        try {
            const row = sqliteDb.prepare('SELECT channel_id FROM guild_log_channels WHERE guild_id = ?').get(guildId);
            if (row && row.channel_id) {
                logChannelCache.set(guildId, row.channel_id);
                return row.channel_id;
            }
        } catch (error) {
            console.error('[STORAGE] SQLite error fetching log channel:', error.message);
        }
    }

    return null;
}

module.exports = {
    connectDB,
    getLogChannelId,
    setLogChannelId,
    setMinecraftLink: async (discordUserId, minecraftUsername) => {
        const db = mongoModels();
        if (!mongoReady()) return;
        try {
            await db.MinecraftLink.findOneAndUpdate(
                { discordUserId },
                { minecraftUsername, updatedAt: new Date() },
                { upsert: true, new: true }
            );
        } catch (error) {
            console.error('[STORAGE] Error setting Minecraft link:', error.message);
        }
    },
    getMinecraftLink: async (discordUserId) => {
        const db = mongoModels();
        if (!mongoReady()) return null;
        try {
            const link = await db.MinecraftLink.findOne({ discordUserId });
            return link?.minecraftUsername || null;
        } catch (error) {
            console.error('[STORAGE] Error getting Minecraft link:', error.message);
            return null;
        }
    },
    getGameState: async (guildId, channelId, game, fallback) => {
        const db = mongoModels();
        if (!mongoReady()) return fallback;
        try {
            const state = await db.GameState.findOne({ guildId, channelId, game });
            return state ? state.value : fallback;
        } catch (error) {
            console.error('[STORAGE] Error getting game state:', error.message);
            return fallback;
        }
    },
    setGameState: async (guildId, channelId, game, value) => {
        const db = mongoModels();
        if (!mongoReady()) return;
        try {
            await db.GameState.findOneAndUpdate(
                { guildId, channelId, game },
                { value, updatedAt: new Date() },
                { upsert: true, new: true }
            );
        } catch (error) {
            console.error('[STORAGE] Error setting game state:', error.message);
        }
    },
};
