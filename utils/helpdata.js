/**
 * Help menu data. Builds the English help embed per category, hides commands
 * the user lacks permission for, and annotates system commands with live
 * Enabled/Disabled module status from SQLite settings.
 */

const fs = require('fs');
const path = require('path');
const { getModules } = require('./db');
const { foxcraftEmbed, envValue } = require('./foxcraft');
const { select } = require('./ui');
const { t } = require('./lang');

const COMMANDS_DIR = path.join(__dirname, '..', 'commands');

const CATEGORIES = [
    { id: 'user', labelKey: 'help_cat_user', hintKey: 'help_hint_user' },
    { id: 'moderation', labelKey: 'help_cat_moderation', hintKey: 'help_hint_moderation' },
    { id: 'bot', labelKey: 'help_cat_bot', hintKey: 'help_hint_bot' },
    { id: 'systems', labelKey: 'help_cat_systems', hintKey: 'help_hint_systems' },
];

const CATEGORY_ALIASES = {
    user: 'user', users: 'user', istifadeci: 'user', istifadeci_əmrləri: 'user',
    moderation: 'moderation', moderasiya: 'moderation', mod: 'moderation', mods: 'moderation',
    bot: 'bot', bots: 'bot',
    systems: 'systems', sistemler: 'systems', sistem: 'systems', sistemlər: 'systems', sistemler_əmrləri: 'systems',
};

const MODULE_KEY = {
    automod: 'automod',
    counting: 'sayma',
    giveaway: 'cekilis',
    welcomer: 'welcomer',
    'ticket-setup': 'ticket',
    register: 'qeydiyyat',
    afk: 'afk',
    setlog: 'modlog',
    logstatus: 'modlog',
};

const COMMAND_CATEGORY = {
    // User
    avatar: 'user', afk: 'user', qrkod: 'user', nickname: 'user',
    serverinfo: 'user', userinfo: 'user', whoami: 'user', link: 'user',
    // Moderation
    ban: 'moderation', unban: 'moderation', kick: 'moderation', mute: 'moderation',
    unmute: 'moderation', lock: 'moderation', unlock: 'moderation', clear: 'moderation',
    slowmode: 'moderation', automod: 'moderation', addrole: 'moderation', removerole: 'moderation',
    setlog: 'moderation', logstatus: 'moderation',
    warn: 'moderation', warnings: 'moderation', removewarn: 'moderation',
    timeout: 'moderation', untimeout: 'moderation', softban: 'moderation', move: 'moderation',
    // Bot
    help: 'bot', panel: 'bot', ping: 'bot', restart: 'bot',
    setup: 'bot', foxcraft: 'bot', servericon: 'bot', 'foxcraft-info': 'bot', lang: 'bot',
    // Voice
    play: 'bot', join: 'bot', skip: 'bot', stop: 'bot', queue: 'bot',
    volume: 'bot', loop: 'bot', replay: 'bot', nowplaying: 'bot',
    // Systems
    sayma: 'systems', cekilis: 'systems', welcomer: 'systems',
    'ticket-setup': 'systems', qeydiyyat: 'systems',
    status: 'systems', rules: 'systems', server: 'systems', sunucukur: 'systems', ip: 'systems',
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
                description: command.data.description || 'No description',
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
        const badge = status === null ? '' : status ? t(guildId, 'help_badge_enabled') : t(guildId, 'help_badge_disabled');
        return `\`/${c.name}\`${badge} - ${c.description}`;
    });

    const hidden = inCategory.length - visible.length;
    const prefix = envValue('PREFIX', '!');
    const parts = [
        lines.length ? lines.join('\n') : t(guildId, 'help_no_commands'),
    ];
    if (hidden > 0) parts.push(t(guildId, 'help_hidden_count', { count: hidden }));
    parts.push(t(guildId, 'help_shown_count', { shown: visible.length, total: inCategory.length, prefix }));
    const description = parts.join('\n\n').slice(0, 4096);

    return foxcraftEmbed(t(guildId, 'help_embed_title', { title: t(guildId, category.labelKey) }), description, [
        { name: t(guildId, 'help_field_status_name'), value: t(guildId, 'help_field_status_value'), inline: true },
        { name: t(guildId, 'help_field_menus_name'), value: t(guildId, 'help_field_menus_value'), inline: true },
    ]);
}

function buildSelect() {
    return select(
        'foxcraft:help-cat',
        t(null, 'help_select_placeholder'),
        CATEGORIES.map((c) => ({
            label: t(null, c.labelKey),
            value: c.id,
            description: t(null, c.hintKey).slice(0, 100),
        })),
        1, 1,
    );
}

/**
 * Detail embed for a single command (used by `!help <command>`).
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
        .map((o) => t(guildId, 'help_param_line', { name: o.name, desc: o.description ? `- ${o.description}` : `- ${t(guildId, 'help_no_description')}`, required: o.required ? t(guildId, 'help_required') : '' }));
    const subLines = command.subcommands.map((sub) => {
        const detail = command.options.find((o) => o.name === sub);
        return t(guildId, 'help_sub_line', { name: command.name, sub, desc: detail?.description ? `- ${detail.description}` : `- ${t(guildId, 'help_no_description')}` });
    });

    const description = [
        command.description,
        status === null ? null : `\n${t(guildId, 'help_module_line', { status: status ? t(guildId, 'help_status_enabled') : t(guildId, 'help_status_disabled') })}`,
        optionLines.length ? `\n${t(guildId, 'help_parameters')}\n${optionLines.join('\n')}` : null,
        subLines.length ? `\n${t(guildId, 'help_subcommands')}\n${subLines.join('\n')}` : null,
    ].filter(Boolean).join('\n').slice(0, 4096);

    return foxcraftEmbed(`/${command.name}`, description, [
        { name: t(guildId, 'help_usage'), value: `\`/${command.signature}\``, inline: false },
        ...(command.hasPrefix ? [{ name: t(guildId, 'help_prefix'), value: `\`${envValue('PREFIX', '!')}${command.signature}\``, inline: true }] : []),
        { name: t(guildId, 'help_category'), value: category ? t(guildId, category.labelKey) : t(guildId, 'help_category_other'), inline: true },
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
