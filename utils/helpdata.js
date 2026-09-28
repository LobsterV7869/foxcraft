/**
 * Help menu data. Builds the Azerbaijani help embed per category, hides
 * commands the user lacks permission for, and annotates system commands with
 * live ✅/❌ module status from SQLite settings.
 */

const fs = require('fs');
const path = require('path');
const { getModules } = require('./db');
const { foxcraftEmbed, envValue } = require('./foxcraft');
const { select, emojiName } = require('./ui');

const COMMANDS_DIR = path.join(__dirname, '..', 'commands');

const CATEGORIES = [
    { id: 'istifadeci', label: '👤 İstifadəçi', title: 'İstifadəçi', hint: 'Profil, server və şəxsi əmrlər' },
    { id: 'moderasiya', label: '🛡️ Moderasiya', title: 'Moderasiya', hint: 'Cəza, idarəetmə və avtomatik qaydalar' },
    { id: 'bot', label: '🤖 Bot', title: 'Bot', hint: 'Kömək, panel və bot əmrləri' },
    { id: 'sistemler', label: '⚙️ Sistemlər', title: 'Sistemlər', hint: 'Sayma, çekiliş, welcomer və ticket' },
];

const CATEGORY_ALIASES = {
    istifadeci: 'istifadeci', user: 'istifadeci', users: 'istifadeci', istifadeci_əmrləri: 'istifadeci',
    moderasiya: 'moderasiya', mod: 'moderasiya', mods: 'moderasiya', moderation: 'moderasiya',
    bot: 'bot', bots: 'bot',
    sistemler: 'sistemler', sistem: 'sistemler', sistemlər: 'sistemler', systems: 'sistemler', sistemler_əmrləri: 'sistemler',
};

const MODULE_KEY = {
    automod: 'automod',
    sayma: 'sayma',
    cekilis: 'cekilis',
    welcomer: 'welcomer',
    'ticket-setup': 'ticket',
    qeydiyyat: 'qeydiyyat',
    afk: 'afk',
    setlog: 'modlog',
    logstatus: 'modlog',
};

const COMMAND_CATEGORY = {
    // User
    avatar: 'istifadeci', afk: 'istifadeci', qrkod: 'istifadeci',
    serverinfo: 'istifadeci', userinfo: 'istifadeci', whoami: 'istifadeci', link: 'istifadeci',
    // Moderation
    ban: 'moderasiya', unban: 'moderasiya', kick: 'moderasiya', mute: 'moderasiya',
    unmute: 'moderasiya', lock: 'moderasiya', unlock: 'moderasiya', sil: 'moderasiya',
    slowmode: 'moderasiya', automod: 'moderasiya', sunucukur: 'moderasiya',
    setlog: 'moderasiya', logstatus: 'moderasiya',
    // Bot
    help: 'bot', panel: 'bot', ping: 'bot', restart: 'bot',
    setup: 'bot', 'foxcraft-info': 'bot', foxcraft: 'bot',
    // Systems
    sayma: 'sistemler', cekilis: 'sistemler', welcomer: 'sistemler',
    'ticket-setup': 'sistemler', qeydiyyat: 'sistemler',
    status: 'sistemler', rules: 'sistemler', server: 'sistemler',
};

let cachedCommands = null;

/** Loads { name -> command info } from ./commands once. */
function loadCommands() {
    if (cachedCommands) return cachedCommands;
    const map = {};
    const files = fs.existsSync(COMMANDS_DIR)
        ? fs.readdirSync(COMMANDS_DIR).filter((f) => f.endsWith('.js'))
        : [];
    for (const file of files) {
        try {
            const command = require(path.join(COMMANDS_DIR, file));
            if (!command?.data?.name) continue;
            const json = typeof command.data.toJSON === 'function' ? command.data.toJSON() : command.data;
            const options = Array.isArray(json.options) ? json.options : [];
            const subcommands = options.filter((o) => o.type === 1).map((o) => o.name);
            const args = options
                .filter((o) => o.type !== 1 && o.type !== 2)
                .map((o) => `<${o.name}${o.required ? '' : '?'}>`);
            const signature = [command.data.name, ...subcommands, ...args].join(' ');
            map[command.data.name] = {
                name: command.data.name,
                description: command.data.description || 'Təsvir yoxdur',
                permission: command.data.default_member_permissions || null,
                category: COMMAND_CATEGORY[command.data.name] || null,
                subcommands,
                options,
                signature,
                hasPrefix: typeof command.prefixExecute === 'function',
            };
        } catch {
            /* skip broken command */
        }
    }
    cachedCommands = map;
    return map;
}

function canUse(member, permission) {
    if (!permission) return true;
    if (!member?.permissions) return false;
    if (typeof member.permissions.has === 'function') {
        return member.permissions.has(permission);
    }
    try {
        const bits = BigInt(member.permissions || '0');
        return (bits & BigInt(permission)) === BigInt(permission);
    } catch {
        return false;
    }
}

function moduleStatus(guildId, commandName) {
    const key = MODULE_KEY[commandName];
    if (!key || !guildId) return null;
    try {
        const modules = getModules(guildId);
        return modules[key]?.enabled === true;
    } catch {
        return null;
    }
}

/** Resolves free text (a prefix argument) to a category id, or null. */
function resolveCategory(input) {
    if (!input) return null;
    const key = String(input).trim().toLowerCase().replace(/\s+/g, '_');
    if (CATEGORY_ALIASES[key]) return CATEGORY_ALIASES[key];
    return CATEGORIES.find((c) => c.id === key)?.id || null;
}

function buildCategoryEmbed(categoryId, guildId, member) {
    const commands = loadCommands();
    const all = Object.values(commands);
    const category = CATEGORIES.find((c) => c.id === categoryId) || CATEGORIES[0];
    const inCategory = all.filter((c) => COMMAND_CATEGORY[c.name] === category.id);
    const visible = inCategory
        .filter((c) => canUse(member, c.permission))
        .sort((a, b) => a.name.localeCompare(b.name));

    const lines = visible.map((c) => {
        const status = moduleStatus(guildId, c.name);
        const badge = status === null ? '' : status ? ' ✅' : ' ❌';
        return `\`/${c.name}\`${badge} — ${c.description}`;
    });

    const hidden = inCategory.length - visible.length;
    const prefix = envValue('PREFIX', '!');
    const parts = [
        lines.length ? lines.join('\n') : '_Bu kateqoriyada sənə açıq olan əmr yoxdur._',
    ];
    if (hidden > 0) parts.push(`> ${hidden} əmr sənin icazənə görə yoxdur.`);
    parts.push(`**${visible.length}/${inCategory.length}** əmr göstərilir • Əmr haqqında: \`${prefix}help <əmr>\``);
    const description = parts.join('\n\n').slice(0, 4096);

    return foxcraftEmbed(`📖 Kömək — ${category.title}`, description, [
        { name: '✅ / ❌', value: 'Sistem əmrlərində modulun aktiv və ya söndürülmüş vəziyyəti.', inline: true },
        { name: '🎛️ Menyular', value: 'Aşağıdakı menyudan kateqoriya dəyiş, idarəetmə üçün `/panel` istifadə et.', inline: true },
    ]);
}

function buildSelect() {
    return select(
        'foxcraft:help-cat',
        '📚 Kateqoriya seç',
        CATEGORIES.map((c) => ({
            label: c.label,
            value: c.id,
            emoji: emojiName(c.label),
            description: c.hint.slice(0, 100),
        })),
        1, 1,
    );
}

/**
 * Detail embed for a single command (used by `!help <əmr>`).
 * Returns null when the command does not exist or is hidden from the member.
 */
function commandDetail(name, guildId, member) {
    const commands = loadCommands();
    const key = String(name || '').trim().toLowerCase().replace(/^\/+/, '');
    const command = commands[key];
    if (!command) return null;
    if (!canUse(member, command.permission)) return null;

    const status = moduleStatus(guildId, command.name);
    const category = CATEGORIES.find((c) => c.id === command.category);
    const optionLines = command.options
        .filter((o) => o.type !== 1 && o.type !== 2)
        .map((o) => `• \`<${o.name}>\` — ${o.description || 'təsvir yoxdur'}${o.required ? ' *(vacib)*' : ''}`);
    const subLines = command.subcommands.map((sub) => {
        const detail = command.options.find((o) => o.name === sub);
        return `• \`${command.name} ${sub}\` — ${detail?.description || 'təsvir yoxdur'}`;
    });

    const description = [
        command.description,
        status === null ? null : `\n**Modul:** ${status ? '✅ Aktiv' : '❌ Söndürülmüş'}`,
        optionLines.length ? `\n**Parametrlər**\n${optionLines.join('\n')}` : null,
        subLines.length ? `\n**Alt əmrlər**\n${subLines.join('\n')}` : null,
    ].filter(Boolean).join('\n').slice(0, 4096);

    return foxcraftEmbed(`📖 /${command.name}`, description, [
        { name: 'İstifadə', value: `\`/${command.signature}\``, inline: false },
        ...(command.hasPrefix ? [{ name: 'Prefix', value: `\`${envValue('PREFIX', '!')}${command.signature}\``, inline: true }] : []),
        { name: 'Kateqoriya', value: category ? category.label : 'Digər', inline: true },
    ]);
}

module.exports = {
    CATEGORIES,
    buildCategoryEmbed,
    buildSelect,
    loadCommands,
    resolveCategory,
    commandDetail,
};
