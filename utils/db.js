/**
 * Per-guild persistent settings backed by SQLite (better-sqlite3).
 *
 * All system modules (automod, welcomer, sayma, cekilis, ticket, qeydiyyat,
 * afk, modlog) read and write their state here, which survives restarts.
 * The API is synchronous on purpose so message handlers and interaction
 * handlers can read settings without awaiting.
 */

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', 'azespace.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

db.exec(`
    CREATE TABLE IF NOT EXISTS guild_settings (
        guild_id   TEXT PRIMARY KEY,
        settings   TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS afk_users (
        guild_id TEXT NOT NULL,
        user_id  TEXT NOT NULL,
        reason   TEXT,
        since    INTEGER NOT NULL,
        PRIMARY KEY (guild_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS giveaways (
        message_id    TEXT PRIMARY KEY,
        guild_id      TEXT NOT NULL,
        channel_id    TEXT NOT NULL,
        prize         TEXT NOT NULL,
        ends_at       INTEGER NOT NULL,
        winners       INTEGER NOT NULL,
        host_id       TEXT,
        entrants      TEXT,
        winners_list  TEXT DEFAULT '[]',
        ended         INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS warnings (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id   TEXT NOT NULL,
        user_id    TEXT NOT NULL,
        moderator  TEXT,
        reason     TEXT,
        created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_warnings_member
        ON warnings (guild_id, user_id);
`);

const DEFAULT_MODULES = {
    automod: {
        enabled: false,
        links: false,
        invites: false,
        caps: false,
        spam: false,
        words: false,
        action: 'delete',
        bannedWords: [],
        whitelistRoles: [],
        whitelistChannels: [],
        capsThreshold: 0.6,
        capsMinLength: 6,
        spamThreshold: 5,
        spamWindowMs: 5000,
    },
    welcomer: {
        enabled: false,
        channel: '',
        leaveChannel: '',
        message: 'Welcome {user} to {server}! We are now {membercount} members.',
        leaveMessage: '{username} left the server.',
        autoRole: '',
        dm: false,
    },
    sayma: {
        enabled: false,
        channel: '',
    },
    cekilis: {
        enabled: true,
    },
    ticket: {
        enabled: true,
        category: '',
    },
    qeydiyyat: {
        enabled: false,
        channel: '',
        role: '',
        message: 'Click the button below to register.',
    },
    afk: {
        enabled: true,
    },
    modlog: {
        enabled: true,
        channel: '',
    },
};

function deepMerge(base, patch) {
    const result = Array.isArray(base) ? [...base] : { ...base };
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return result;
    for (const [key, value] of Object.entries(patch)) {
        result[key] = value && typeof value === 'object' && !Array.isArray(value)
            ? deepMerge(result[key] && typeof result[key] === 'object' ? result[key] : {}, value)
            : value;
    }
    return result;
}

/**
 * Returns the raw stored settings blob for a guild (or {} when unset).
 */
function getGuildData(guildId) {
    if (!guildId) return {};
    try {
        const row = db.prepare('SELECT settings FROM guild_settings WHERE guild_id = ?').get(String(guildId));
        if (!row) return {};
        const parsed = JSON.parse(row.settings);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
        console.error('[DB] Settings not read:', error.message);
        return {};
    }
}

/**
 * Deep-merges a patch into the stored settings and saves it.
 */
function updateGuildData(guildId, patch) {
    if (!guildId || !patch || typeof patch !== 'object' || Array.isArray(patch)) return getGuildData(guildId);
    const next = deepMerge(getGuildData(guildId), patch);
    try {
        db.prepare(`
            INSERT INTO guild_settings (guild_id, settings, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(guild_id) DO UPDATE SET settings = excluded.settings, updated_at = CURRENT_TIMESTAMP
        `).run(String(guildId), JSON.stringify(next));
    } catch (error) {
        console.error('[DB] Settings not written:', error.message);
    }
    return next;
}

/**
 * Returns the module settings for a guild with all defaults filled in.
 * Always returns a fresh deep copy so callers never mutate the defaults.
 */
function getModules(guildId) {
    const stored = getGuildData(guildId).modules;
    return deepMerge(DEFAULT_MODULES, stored || {});
}

/**
 * Saves a full module settings object for a guild.
 */
function setModules(guildId, modules) {
    return updateGuildData(guildId, { modules });
}

/**
 * Toggles a module on/off and returns the new state.
 */
function toggleModule(guildId, key) {
    const modules = getModules(guildId);
    if (!modules[key]) modules[key] = { enabled: false };
    modules[key].enabled = !modules[key].enabled;
    setModules(guildId, modules);
    return modules[key].enabled;
}

// ---- AFK --------------------------------------------------------------------

function setAfk(guildId, userId, reason) {
    db.prepare(`
        INSERT INTO afk_users (guild_id, user_id, reason, since)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(guild_id, user_id) DO UPDATE SET reason = excluded.reason, since = excluded.since
    `).run(String(guildId), String(userId), reason || null, Date.now());
}

function getAfk(guildId, userId) {
    return db.prepare('SELECT * FROM afk_users WHERE guild_id = ? AND user_id = ?')
        .get(String(guildId), String(userId)) || null;
}

function clearAfk(guildId, userId) {
    return db.prepare('DELETE FROM afk_users WHERE guild_id = ? AND user_id = ?')
        .run(String(guildId), String(userId)).changes > 0;
}

// ---- Giveaways ---------------------------------------------------------------

function createGiveaway(data) {
    db.prepare(`
        INSERT OR REPLACE INTO giveaways
        (message_id, guild_id, channel_id, prize, ends_at, winners, host_id, entrants, winners_list, ended)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, '[]', 0)
    `).run(
        String(data.messageId), String(data.guildId), String(data.channelId),
        String(data.prize), Number(data.endsAt), Number(data.winners || 1),
        String(data.hostId || ''), JSON.stringify(data.entrants || [])
    );
}

function getGiveaway(messageId) {
    const row = db.prepare('SELECT * FROM giveaways WHERE message_id = ?').get(String(messageId));
    if (!row) return null;
    return { ...row, entrants: safeJson(row.entrants), winnersList: safeJson(row.winners_list) };
}

function listActiveGiveaways() {
    const rows = db.prepare('SELECT * FROM giveaways WHERE ended = 0').all();
    return rows.map((row) => ({ ...row, entrants: safeJson(row.entrants), winnersList: safeJson(row.winners_list) }));
}

function updateGiveaway(messageId, patch) {
    const existing = db.prepare('SELECT * FROM giveaways WHERE message_id = ?').get(String(messageId));
    if (!existing) return null;
    const next = { ...existing, ...patch };
    // `existing` holds the raw (JSON-encoded) columns, so normalize them before
    // re-encoding — otherwise the values would be stringified twice and the
    // entrant list would be lost.
    const entrants = Array.isArray(next.entrants) ? next.entrants : safeJson(existing.entrants);
    const winnersList = Array.isArray(next.winnersList) ? next.winnersList : safeJson(existing.winners_list);
    db.prepare(`
        UPDATE giveaways
        SET entrants = ?, winners = ?, ended = ?, prize = ?, ends_at = ?, channel_id = ?, guild_id = ?, winners_list = ?
        WHERE message_id = ?
    `).run(
        JSON.stringify(entrants),
        Number(next.winners || 1),
        Number(next.ended || 0),
        String(next.prize || ''),
        Number(next.ends_at || 0),
        String(next.channel_id || ''),
        String(next.guild_id || ''),
        JSON.stringify(winnersList),
        String(messageId)
    );
    return { ...next, entrants, winnersList };
}

function addGiveawayEntrant(messageId, userId) {
    const g = getGiveaway(messageId);
    if (!g) return { ok: false, reason: 'notfound' };
    if (g.ended) return { ok: false, reason: 'ended' };
    if (g.entrants.includes(userId)) return { ok: false, reason: 'duplicate' };
    g.entrants.push(userId);
    updateGiveaway(messageId, { entrants: g.entrants });
    return { ok: true, entrants: g.entrants.length };
}

// ---- Warnings ----------------------------------------------------------------

function addWarning(guildId, userId, moderator, reason) {
    const result = db.prepare(`
        INSERT INTO warnings (guild_id, user_id, moderator, reason, created_at)
        VALUES (?, ?, ?, ?, ?)
    `).run(String(guildId), String(userId), String(moderator || ''), String(reason || ''), Date.now());
    return Number(result.lastInsertRowid);
}

function getWarnings(guildId, userId) {
    // id is the tiebreaker: warnings issued in the same millisecond otherwise
    // come back in an arbitrary order, so the id a moderator picks from
    // /warnings may not be the one they think it is.
    return db.prepare('SELECT * FROM warnings WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC, id DESC')
        .all(String(guildId), String(userId));
}

function countWarnings(guildId, userId) {
    const row = db.prepare('SELECT COUNT(*) AS total FROM warnings WHERE guild_id = ? AND user_id = ?')
        .get(String(guildId), String(userId));
    return Number(row?.total || 0);
}

/**
 * Removes one warning by id. Scoped to both the guild AND the member: ids are
 * global, so without the user check `removeWarning @alice 7` would happily
 * delete bob's warning while reporting it as alice's.
 */
function removeWarning(guildId, userId, warningId) {
    return db.prepare('DELETE FROM warnings WHERE id = ? AND guild_id = ? AND user_id = ?')
        .run(Number(warningId), String(guildId), String(userId)).changes > 0;
}

function clearWarnings(guildId, userId) {
    return db.prepare('DELETE FROM warnings WHERE guild_id = ? AND user_id = ?')
        .run(String(guildId), String(userId)).changes;
}

function safeJson(value, fallback = []) {
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : fallback;
    } catch {
        return fallback;
    }
}

module.exports = {
    DEFAULT_MODULES,
    getGuildData,
    updateGuildData,
    getModules,
    setModules,
    toggleModule,
    setAfk,
    getAfk,
    clearAfk,
    createGiveaway,
    getGiveaway,
    listActiveGiveaways,
    updateGiveaway,
    addGiveawayEntrant,
    addWarning,
    getWarnings,
    countWarnings,
    removeWarning,
    clearWarnings,
};
