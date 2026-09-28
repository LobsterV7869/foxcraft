/**
 * Help menu data. Builds the Azerbaijani help embed per category, hides
 * commands the user lacks permission for, and annotates system commands with
 * live ✅/❌ module status from SQLite settings.
 */

const fs = require('fs');
const path = require('path');
const { getModules } = require('./db');
const { foxcraftEmbed } = require('./foxcraft');
const { select } = require('./ui');

const COMMANDS_DIR = path.join(__dirname, '..', 'commands');

const CATEGORIES = [
    { id: 'istifadeci', label: '👤 İstifadəçi' },
    { id: 'moderasiya', label: '🛡️ Moderasiya' },
    { id: 'bot', label: '🤖 Bot' },
    { id: 'sistemler', label: '⚙️ Sistemlər' },
];

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

/** Loads { name -> { name, description, permission } } from ./commands once. */
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
            map[command.data.name] = {
                name: command.data.name,
                description: command.data.description || 'Təsvir yoxdur',
                permission: command.data.default_member_permissions || null,
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

function buildCategoryEmbed(categoryId, guildId, member) {
    const commands = loadCommands();
    const members = Object.values(commands)
        .filter((c) => COMMAND_CATEGORY[c.name] === categoryId && canUse(member, c.permission))
        .sort((a, b) => a.name.localeCompare(b.name));

    const lines = members.map((c) => {
        const status = moduleStatus(guildId, c.name);
        const suffix = status === null ? '' : ` — ${status ? '✅' : '❌'}`;
        return `\`/${c.name}\` — ${c.description}${suffix}`;
    });

    const catLabel = CATEGORIES.find((c) => c.id === categoryId)?.label || categoryId;
    return foxcraftEmbed(
        `📖 Kömək — ${catLabel}`,
        lines.length ? lines.join('\n') : 'Bu kateqoriyada icazən olan əmr yoxdur.',
    );
}

function buildSelect() {
    return select(
        'foxcraft:help-cat',
        'Kateqoriya seç',
        CATEGORIES.map((c) => ({
            label: c.label,
            value: c.id,
            emoji: c.label.slice(0, 1),
            description: `${c.label} əmrləri`,
        })),
        1, 1,
    );
}

module.exports = { CATEGORIES, buildCategoryEmbed, buildSelect, loadCommands };