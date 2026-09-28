/**
 * /panel — bot idarəetmə paneli. Yalnız OWNER_ID istifadə edə bilər.
 * Canlı modul statusları, hər modul üçün aktiv/deaktiv toggle, Ayarlar modalı
 * və "Botu yenidən başlat" düyməsi. Bütün parametrlər SQLite-da (utils/db.js)
 * saxlanılır və dərhal tətbiq olunur.
 */

const { SlashCommandBuilder } = require('discord.js');
const { ephemeralReply, publicReply } = require('../utils/interaction');
const { envValue, foxcraftEmbed } = require('../utils/foxcraft');
const { setLogChannelId } = require('../utils/storage');
const { getModules, setModules, updateGuildData } = require('../utils/db');
const { registerComponent, button, select, rows } = require('../utils/ui');

const MODULES = [
    { key: 'automod', label: '🤖 Automod' },
    { key: 'welcomer', label: '👋 Welcomer' },
    { key: 'sayma', label: '🔢 Sayma' },
    { key: 'cekilis', label: '🎁 Çəkiliş' },
    { key: 'ticket', label: '🎫 Ticket' },
    { key: 'qeydiyyat', label: '🗳️ Qeydiyyat' },
    { key: 'afk', label: '💤 AFK' },
    { key: 'modlog', label: '📋 Mod-loq' },
];

const selectedModule = new Map();

function isOwner(userId) {
    const ownerId = envValue('OWNER_ID');
    return Boolean(ownerId && userId && ownerId === userId);
}

function panelEmbed(guildId) {
    const m = getModules(guildId);
    const lines = MODULES.map((mod) => {
        const state = m[mod.key]?.enabled === true ? '✅ Aktiv' : '❌ Deaktiv';
        return `${mod.label} — **${state}**`;
    });
    return foxcraftEmbed(
        '🎛️ Bot İdarəetmə Paneli',
        lines.join('\n'),
        [{ name: 'İstifadə', value: 'Modulu seç, sonra Aktiv/Deaktiv və ya Ayarlar.', inline: false }],
    );
}

function panelComponents(guildId) {
    const m = getModules(guildId);
    const selected = selectedModule.get(guildId) || 'automod';
    const modSelect = select('foxcraft:panel-module', 'Modulu seç', MODULES.map((mod) => ({
        label: mod.label,
        value: mod.key,
        emoji: mod.label.split(' ')[0],
        description: m[mod.key]?.enabled === true ? 'Aktiv' : 'Deaktiv',
        default: mod.key === selected,
    })), 1, 1);

    const current = m[selected]?.enabled === true;
    return rows(
        modSelect,
        [
            button('foxcraft:panel-toggle', current ? '❌ Deaktiv et' : '✅ Aktiv et', current ? 4 : 3, current ? '❌' : '✅'),
            button('foxcraft:panel-settings', '⚙️ Ayarlar', 2, '⚙️'),
            button('foxcraft:panel-refresh', '🆕 Yenilə', 2, '🆕'),
            button('foxcraft:panel-restart', '🔁 Botu yenidən başlat', 4, '🔁'),
        ],
    );
}

function denyOrRun(ctx, handler) {
    const userId = ctx.user?.id;
    if (!isOwner(userId)) {
        return ctx.reply({ content: 'Bu paneldən yalnız bot sahibi istifadə edə bilər.', ephemeral: true });
    }
    return handler();
}

async function updatePanel(ctx, note) {
    const embed = panelEmbed(ctx.guildId);
    const components = panelComponents(ctx.guildId);
    await ctx.update({ embeds: [embed], components, content: note || undefined });
}

// ---- module settings modals -------------------------------------------------

function textInput(id, label, value = '', placeholder = '', style = 1, required = true) {
    return { type: 4, custom_id: id, label, style, required, value, placeholder };
}

function welcomerModal(m) {
    return {
        custom_id: 'foxcraft:panel-modal:welcomer',
        title: '👋 Welcomer Ayarlar',
        components: [{
            type: 1, components: [
                textInput('kanal', 'Xoş gəldin kanal ID', m.channel || '', 'Kanal ID daxil et'),
                textInput('cixis', 'Çıxış kanal ID', m.leaveChannel || '', 'Kanal ID (boş ola bilər)', 1, false),
                textInput('rol', 'Avto-rol ID', m.autoRole || '', 'Rol ID (boş ola bilər)', 1, false),
                textInput('message', 'Xoş gəldin mesajı', m.message, 'Mətn: {user} {username} {server} {membercount}'),
                textInput('dm', 'DM göndərilsin (0/1)', String(m.dm ? 1 : 0), '1 və ya 0'),
            ],
        }],
    };
}

function saymaModal(m) {
    return {
        custom_id: 'foxcraft:panel-modal:sayma',
        title: '🔢 Sayma Ayarlar',
        components: [{
            type: 1, components: [
                textInput('kanal', 'Sayma kanal ID', m.channel || '', 'Kanal ID'),
            ],
        }],
    };
}

function ticketModal(m) {
    return {
        custom_id: 'foxcraft:panel-modal:ticket',
        title: '🎫 Ticket Ayarlar',
        components: [{
            type: 1, components: [
                textInput('category', 'Kateqoriya ID', m.category || '', 'Ticket kateqoriyasının ID-si (boş = avtomatik)', 1, false),
            ],
        }],
    };
}

function qeydiyyatModal(m) {
    return {
        custom_id: 'foxcraft:panel-modal:qeydiyyat',
        title: '🗳️ Qeydiyyat Ayarlar',
        components: [{
            type: 1, components: [
                textInput('kanal', 'Panel kanal ID', m.channel || '', 'Kanal ID'),
                textInput('rol', 'Veriləcək rol ID', m.role || '', 'Rol ID'),
                textInput('mesaj', 'Panel mesajı (mətn)', m.message || '', 'Panel başlığı', 1, false),
            ],
        }],
    };
}

function automodFilterModal(c) {
    return {
        custom_id: 'foxcraft:panel-modal:automod:filter',
        title: '🤖 Automod — Süzgəclər',
        components: [{
            type: 1, components: [
                textInput('links', 'Keçidlər (1/0)', String(c.links ? 1 : 0), '1 və ya 0'),
                textInput('invites', 'Dəvət linkləri (1/0)', String(c.invites ? 1 : 0)),
                textInput('caps', 'Böyük hərflər (1/0)', String(c.caps ? 1 : 0)),
                textInput('spam', 'Spam/Flood (1/0)', String(c.spam ? 1 : 0)),
                textInput('action', 'Hərəkət (delete/warn/timeout)', c.action),
            ],
        }],
    };
}

function automodWordsModal(c) {
    return {
        custom_id: 'foxcraft:panel-modal:automod:words',
        title: '🤖 Automod — Sözlər',
        components: [{
            type: 1, components: [
                textInput('words', 'Qadağan sözlər (vergüllə)', c.bannedWords?.join(', ') || '', 'söz1, söz2, ...'),
            ],
        }],
    };
}

function automodExceptionsModal(c) {
    return {
        custom_id: 'foxcraft:panel-modal:automod:exceptions',
        title: '🤖 Automod — İstisnalar',
        components: [{
            type: 1, components: [
                textInput('roles', 'İstisna rollar (ID-lər vergüllə)', c.whitelistRoles?.join(', ') || '', 'Rol ID-ləri'),
                textInput('channels', 'İstisna kanallar (ID-lər vergüllə)', c.whitelistChannels?.join(', ') || '', 'Kanal ID-ləri'),
            ],
        }],
    };
}

// ---- command ---------------------------------------------------------------

module.exports = {
    data: new SlashCommandBuilder()
        .setName('panel')
        .setDescription('Bot idarəetmə paneli (yalnız sahib)'),
    async execute(interaction) {
        const userId = interaction.user?.id || interaction.member?.user?.id;
        if (!isOwner(userId)) return ephemeralReply('Bu paneldən yalnız bot sahibi istifadə edə bilər.');
        const res = publicReply(null, [panelEmbed(interaction.guild_id)]);
        res.data.components = panelComponents(interaction.guild_id);
        return res;
    },
    async prefixExecute(message) {
        if (!isOwner(message.author.id)) return message.reply('Bu paneldən yalnız bot sahibi istifadə edə bilər.');
        return message.reply({
            embeds: [panelEmbed(message.guild.id)],
            components: panelComponents(message.guild.id),
        });
    },
    panelEmbed,
    panelComponents,
};

// ---- component handlers ------------------------------------------------------

registerComponent('foxcraft:panel-module', (ctx) => denyOrRun(ctx, async () => {
    selectedModule.set(ctx.guildId, ctx.values[0] || 'automod');
    await updatePanel(ctx);
}));

registerComponent('foxcraft:panel-toggle', (ctx) => denyOrRun(ctx, async () => {
    const key = selectedModule.get(ctx.guildId) || 'automod';
    const modules = getModules(ctx.guildId);
    if (!modules[key]) modules[key] = { enabled: false };
    modules[key].enabled = !(modules[key].enabled === true);
    setModules(ctx.guildId, modules);
    const label = MODULES.find((m) => m.key === key)?.label || key;
    await updatePanel(ctx, `**${label}** ${modules[key].enabled ? '✅ aktivləşdirildi' : '❌ söndürüldü'}.`);
}));

registerComponent('foxcraft:panel-refresh', (ctx) => denyOrRun(ctx, async () => {
    await updatePanel(ctx);
}));

registerComponent('foxcraft:panel-settings', (ctx) => denyOrRun(ctx, async () => {
    const key = selectedModule.get(ctx.guildId) || 'automod';
    const modules = getModules(ctx.guildId);
    const mod = modules[key] || {};
    switch (key) {
        case 'welcomer':
            return ctx.showModal(welcomerModal(mod));
        case 'sayma':
            return ctx.showModal(saymaModal(mod));
        case 'ticket':
            return ctx.showModal(ticketModal(mod));
        case 'qeydiyyat':
            return ctx.showModal(qeydiyyatModal(mod));
        case 'modlog':
            return ctx.showModal({
                custom_id: 'foxcraft:panel-modal:modlog',
                title: '📋 Mod-loq Ayarlar',
                components: [{
                    type: 1, components: [textInput('kanal', 'Mod-loq kanal ID', mod.channel || '', 'Kanal ID')],
                }],
            });
        case 'automod':
            await ctx.update({
                embeds: [foxcraftEmbed('🤖 Automod — Ayarlar', 'Hansı parametrləri dəyişmək istəyirsən?')],
                components: rows(select('foxcraft:panel-auto-menu', 'Parametr seç', [
                    { label: 'Süzgəclər', value: 'filter', emoji: '🔎' },
                    { label: 'Qadağan sözlər', value: 'words', emoji: '🚷' },
                    { label: 'İstisnalar (rollar/kanallar)', value: 'exceptions', emoji: '⛔' },
                ], 1, 1)),
            });
            return;
        default:
            return ctx.reply({ content: 'Bu modul üçün ayar modalı yoxdur — sadəcə Aktiv/Deaktiv istifadə olunur.', ephemeral: true });
    }
}));

registerComponent('foxcraft:panel-auto-menu', (ctx) => denyOrRun(ctx, async () => {
    const purpose = ctx.values[0] || 'filter';
    const cfg = getModules(ctx.guildId).automod || {};
    if (purpose === 'filter') return ctx.showModal(automodFilterModal(cfg));
    if (purpose === 'words') return ctx.showModal(automodWordsModal(cfg));
    return ctx.showModal(automodExceptionsModal(cfg));
}));

registerComponent('foxcraft:panel-modal', (ctx) => denyOrRun(ctx, async () => {
    const parts = ctx.customId.split(':');
    const section = parts[2] || '';
    const purpose = parts[3];
    const modules = getModules(ctx.guildId);
    const val = (id) => ctx.getTextInput(id);

    if (section === 'welcomer') {
        modules.welcomer = {
            ...modules.welcomer,
            channel: val('kanal').trim(),
            leaveChannel: val('cixis').trim(),
            autoRole: val('rol').trim(),
            message: val('message').trim() || modules.welcomer.message,
            dm: val('dm').trim() === '1',
        };
    } else if (section === 'sayma') {
        modules.sayma = { ...modules.sayma, channel: val('kanal').trim() };
    } else if (section === 'ticket') {
        modules.ticket = { ...modules.ticket, category: val('category').trim() };
    } else if (section === 'qeydiyyat') {
        modules.qeydiyyat = {
            ...modules.qeydiyyat,
            channel: val('kanal').trim(),
            role: val('rol').trim(),
            message: val('mesaj').trim() || modules.qeydiyyat.message,
        };
    } else if (section === 'modlog') {
        modules.modlog = { ...modules.modlog, channel: val('kanal').trim() };
        if (modules.modlog.channel) await setLogChannelId(ctx.guildId, modules.modlog.channel);
    } else if (section === 'automod') {
        const cfg = { ...(modules.automod || {}) };
        if (purpose === 'filter') {
            cfg.links = val('links').trim() === '1';
            cfg.invites = val('invites').trim() === '1';
            cfg.caps = val('caps').trim() === '1';
            cfg.spam = val('spam').trim() === '1';
            const action = val('action').trim().toLowerCase();
            if (['delete', 'warn', 'timeout'].includes(action)) cfg.action = action;
        } else if (purpose === 'words') {
            const words = val('words').split(',').map((s) => s.trim()).filter(Boolean);
            cfg.words = words.length > 0;
            cfg.bannedWords = words;
        } else if (purpose === 'exceptions') {
            cfg.whitelistRoles = val('roles').split(',').map((s) => s.trim()).filter(Boolean);
            cfg.whitelistChannels = val('channels').split(',').map((s) => s.trim()).filter(Boolean);
        }
        modules.automod = cfg;
    } else {
        return ctx.reply({ content: 'Naməlum ayar.', ephemeral: true });
    }

    updateGuildData(ctx.guildId, { modules });
    await updatePanel(ctx, '⚙️ Ayar dəyişildi və saxlandı.');
}));

registerComponent('foxcraft:panel-restart', (ctx) => denyOrRun(ctx, async () => {
    await ctx.update({
        content: '🔁 Bot yenidən başladılsın? Bu bir neçə saniyə davam edəcək.',
        embeds: [],
        components: rows(
            button('foxcraft:panel-restart-confirm', 'Bəli, yenidən başlat', 4, '🔁'),
            button('foxcraft:panel-restart-cancel', 'Xeyr', 2, '✖️'),
        ),
    });
}));

registerComponent('foxcraft:panel-restart-cancel', (ctx) => denyOrRun(ctx, async () => {
    const embed = panelEmbed(ctx.guildId);
    await ctx.update({ embeds: [embed], components: panelComponents(ctx.guildId), content: undefined });
}));

registerComponent('foxcraft:panel-restart-confirm', (ctx) => denyOrRun(ctx, async () => {
    if (!isOwner(ctx.user?.id)) return;
    await ctx.reply({ content: '🔁 Bot yenidən başladılır...', ephemeral: false });
    setTimeout(() => process.exit(0), 1200);
}));