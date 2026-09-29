/**
 * Per-server language selection.
 *
 * The language is stored in the existing guild config (server.language) and
 * defaults to English. `t()` is deliberately synchronous and reads the
 * in-memory cache, because it runs inside message handlers where awaiting a
 * database round trip on every reply would be wasteful. `loadGuildConfig()`
 * is called at startup for every guild to fill that cache.
 *
 * Ticket and confession panels are intentionally NOT translated: they are built
 * in one place each and stay in Azerbaijani, as requested.
 */

const { getGuildConfig, setGuildConfig } = require('./config');

const DEFAULT_LANG = 'en';
const LANGS = ['en', 'az'];

/**
 * Message catalogue. Every entry is { en, az }.
 * `{name}` placeholders are replaced from the vars argument.
 */
const MESSAGES = {
    // ---- generic errors / replies ----
    no_permission: {
        en: 'You do not have the required permissions for this command.',
        az: 'Bu əmr üçün lazım olan icazələriniz yoxdur.',
    },
    server_only: {
        en: 'This command can only be used on a server.',
        az: 'Bu əmr yalnız serverdə istifadə oluna bilər.',
    },
    guild_load_failed: {
        en: 'Server information could not be loaded.',
        az: 'Server məlumatları alınmadı.',
    },
    command_failed: {
        en: 'The command failed. The problem was logged in the console.',
        az: 'Əmr icra edilmədi. Problem konsolda qeyd edildi.',
    },
    unexpected_error: {
        en: 'An unexpected error occurred. The problem was logged in the console.',
        az: 'Gözlənilməz xəta baş verdi. Problem konsolda qeyd edildi.',
    },
    user_not_found: {
        en: 'User not found.',
        az: 'İstifadəçi tapılmadı.',
    },

    // ---- profile ----
    profile_usage: {
        en: 'Please enter a username: `!profile <username>`',
        az: 'Zəhmət olmasa istifadəçi adını daxil edin: `!profile <username>`',
    },
    profile_title: {
        en: 'User Profile',
        az: 'İstifadəçi Profili',
    },
    profile_of: {
        en: 'Profile of **{name}**',
        az: '**{name}** istifadəçisinin məlumatları',
    },
    profile_error: {
        en: 'An error occurred while loading the profile.',
        az: 'Profil məlumatları alınarkən xəta baş verdi.',
    },
    field_id: { en: 'ID', az: 'İD' },
    field_joined: { en: 'Joined', az: 'Qoşulma Tarixi' },

    // ---- welcome ----
    welcome_message: {
        en: 'Welcome {user} to the FoxCraft server!',
        az: 'Salam {user}, FoxCraft serverinə xoş gəldin!',
    },
    welcome_channel_missing: {
        en: 'Welcome lobby channel not found. Expected a name ending in "lobby".',
        az: 'Xoş gəldin lobi kanalı tapılmadı. Gözlənilən ad: lobi',
    },

    // ---- games ----
    counting_warning: {
        en: 'The next number must be written correctly, and the same member cannot count twice in a row.',
        az: 'Növbəti düzgün rəqəm yazılmalıdır və eyni üzv ardıcıl yaza bilməz.',
    },
    counting_report_title: {
        en: 'Daily counting report',
        az: 'Gündəlik sayma hesabatı',
    },
    counting_report_empty: {
        en: 'Nobody counted today.',
        az: 'Bu gün heç kim saymayıb.',
    },
    spam_title: {
        en: 'Possible spam',
        az: 'Mümkün spam hücumu',
    },
    spam_detail: {
        en: '{user} sent multiple messages within 5 seconds.',
        az: '{user} 5 saniyə ərzində çoxlu mesaj göndərdi.',
    },

    // ---- language command ----
    lang_set: {
        en: 'The language for this server is now **{lang}**.',
        az: 'Bu serverin dili indi **{lang}** oldu.',
    },
    lang_current: {
        en: 'The language for this server is **{lang}**. Use `!lang en` or `!lang az` to change it.',
        az: 'Bu serverin dili **{lang}** dir. Dəyişmək üçün `!lang en` və ya `!lang az` yazın.',
    },
    lang_usage: {
        en: 'Usage: `!lang <en|az>`',
        az: 'İstifadəsi: `!lang <en|az>`',
    },
    lang_invalid: {
        en: 'Unknown language "{lang}". Use `en` or `az`.',
        az: 'Bilinməz dil "{lang}". `en` və ya `az` istifadə edin.',
    },
    lang_name_en: { en: 'English', az: 'İngilis dili' },
    lang_name_az: { en: 'Azerbaijani', az: 'Azərbaycan dili' },
};

// The bulk of the catalogue lives in lang-text.js as compact [en, az] pairs.
// Merging here keeps the { en, az } shape and lets lang-text.js stay readable.
for (const [key, [en, az]] of Object.entries(require('./lang-text'))) {
    MESSAGES[key] = { en, az };
}

/** guildId -> lang, kept in sync with the guild config cache. */
function currentLang(guildId) {
    if (!guildId) return DEFAULT_LANG;
    const stored = getGuildConfig(guildId)?.server?.language;
    return LANGS.includes(stored) ? stored : DEFAULT_LANG;
}

/**
 * Resolves a message for a guild. Unknown keys return the key itself so a
 * missing translation is obvious in the channel instead of rendering "undefined".
 */
function t(guildId, key, vars = {}) {
    const entry = MESSAGES[key];
    if (!entry) return key;
    const lang = currentLang(guildId);
    const template = entry[lang] ?? entry[DEFAULT_LANG] ?? key;
    return template.replace(/\{(\w+)\}/g, (match, name) => (
        vars[name] === undefined || vars[name] === null ? match : String(vars[name])
    ));
}

/** Human-readable language name, in the server's own language. */
function languageName(guildId, lang) {
    return t(guildId, lang === 'az' ? 'lang_name_az' : 'lang_name_en');
}

/**
 * Sets and persists the language for a guild. Returns the stored value.
 */
async function setLang(guildId, lang) {
    const next = LANGS.includes(lang) ? lang : DEFAULT_LANG;
    if (!guildId) return next;
    await setGuildConfig(guildId, { server: { language: next } });
    return next;
}

module.exports = {
    DEFAULT_LANG,
    LANGS,
    MESSAGES,
    t,
    currentLang,
    languageName,
    setLang,
};
