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

const { t } = require('../utils/lang');

const MODULES = [
    { key: 'automod', labelKey: 'panel_mod_automod', emoji: '\u{1F916}' },
    { key: 'welcomer', labelKey: 'panel_mod_welcomer', emoji: '\u{1F44B}' },
    { key: 'sayma', labelKey: 'panel_mod_sayma', emoji: '\u{1F522}' },
    { key: 'cekilis', labelKey: 'panel_mod_cekilis', emoji: '\u{1F381}' },
    { key: 'ticket', labelKey: 'panel_mod_ticket', emoji: '\u{1F3AB}' },
    { key: 'qeydiyyat', labelKey: 'panel_mod_qeydiyyat', emoji: '\u{1F5F3}\u{FE0F}' },
    { key: 'afk', labelKey: 'panel_mod_afk', emoji: '\u{1F4A4}' },
    { key: 'modlog', labelKey: 'panel_mod_modlog', emoji: '\u{1F4CB}' },
];

const selectedModule = new Map();

function isOwner(userId) {
    const ownerId = envValue('OWNER_ID');
    return Boolean(ownerId && userId && ownerId === userId);
}

function panelEmbed(guildId) {
    const m = getModules(guildId);
    const lines = MODULES.map((mod) => {
        const on = m[mod.key]?.enabled === true;
        const state = `${on ? '✅' : '❌'} ${t(guildId, on ? 'automod_enabled' : 'automod_disabled')}`;
        return `${t(guildId, mod.labelKey)} — **${state}**`;
    });
    return foxcraftEmbed(
        t(guildId, 'panel_embed_title'),
        lines.join('\n'),
        [{ name: t(guildId, 'panel_usage_field'), value: t(guildId, 'panel_usage_value'), inline: false }],
    );
}

function panelComponents(guildId) {
    const m = getModules(guildId);
    const selected = selectedModule.get(guildId) || 'automod';
    const modSelect = select('foxcraft:panel-module', t(guildId, 'panel_select_module'), MODULES.map((mod) => ({
        label: t(guildId, mod.labelKey),
        value: mod.key,
        emoji: mod.emoji,
        description: t(guildId, m[mod.key]?.enabled === true ? 'automod_enabled' : 'automod_disabled'),
        default: mod.key === selected,
    })), 1, 1);

    const current = m[selected]?.enabled === true;
    return rows(
        modSelect,
        [
            button('foxcraft:panel-toggle', `${current ? '❌' : '✅'} ${t(guildId, current ? 'panel_disable' : 'panel_enable')}`, current ? 4 : 3, current ? '❌' : '✅'),
            button('foxcraft:panel-settings', t(guildId, 'panel_settings'), 2, '\u2699\uFE0F'),
            button('foxcraft:panel-refresh', t(guildId, 'panel_refresh'), 2, null),
            button('foxcraft:panel-restart', t(guildId, 'panel_restart_btn'), 4, null),
        ],
    );
}

function denyOrRun(ctx, handler) {
    const userId = ctx.user?.id;
    if (!isOwner(userId)) {
        return ctx.reply({ content: t(ctx.guildId, 'owner_only_panel'), ephemeral: true });
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

function welcomerModal(m, gid) {
    return {
        custom_id: 'foxcraft:panel-modal:welcomer',
        title: t(gid, 'panel_welcomer_title'),
        components: [{
            type: 1, components: [
                textInput('kanal', t(gid, 'panel_welcomer_channel'), m.channel || '', t(gid, 'ph_channel_id')),
                textInput('cixis', t(gid, 'panel_welcomer_leave'), m.leaveChannel || '', t(gid, 'ph_channel_id_opt'), 1, false),
                textInput('rol', t(gid, 'panel_welcomer_autorole'), m.autoRole || '', t(gid, 'ph_role_id_opt'), 1, false),
                textInput('message', t(gid, 'panel_welcomer_message'), m.message, t(gid, 'ph_message_vars')),
                textInput('dm', t(gid, 'panel_welcomer_dm'), String(m.dm ? 1 : 0), t(gid, 'ph_0_or_1')),
            ],
        }],
    };
}

function saymaModal(m, gid) {
    return {
        custom_id: 'foxcraft:panel-modal:sayma',
        title: t(gid, 'panel_sayma_title'),
        components: [{
            type: 1, components: [
                textInput('kanal', t(gid, 'panel_sayma_channel'), m.channel || '', t(gid, 'ph_channel_id')),
            ],
        }],
    };
}

function ticketModal(m, gid) {
    return {
        custom_id: 'foxcraft:panel-modal:ticket',
        title: t(gid, 'panel_ticket_title'),
        components: [{
            type: 1, components: [
                textInput('category', t(gid, 'panel_ticket_category'), m.category || '', t(gid, 'ph_ticket_category'), 1, false),
            ],
        }],
    };
}

function qeydiyyatModal(m, gid) {
    return {
        custom_id: 'foxcraft:panel-modal:qeydiyyat',
        title: t(gid, 'panel_qeydiyyat_title'),
        components: [{
            type: 1, components: [
                textInput('kanal', t(gid, 'panel_qeydiyyat_channel'), m.channel || '', t(gid, 'ph_channel_id')),
                textInput('rol', t(gid, 'panel_qeydiyyat_role'), m.role || '', t(gid, 'ph_role_id')),
                textInput('mesaj', t(gid, 'panel_qeydiyyat_message'), m.message || '', t(gid, 'ph_panel_title'), 1, false),
            ],
        }],
    };
}

function automodFilterModal(c, gid) {
    return {
        custom_id: 'foxcraft:panel-modal:automod:filter',
        title: t(gid, 'panel_automod_filters_title'),
        components: [{
            type: 1, components: [
                textInput('links', t(gid, 'panel_auto_links'), String(c.links ? 1 : 0), t(gid, 'ph_0_or_1')),
                textInput('invites', t(gid, 'panel_auto_invites'), String(c.invites ? 1 : 0), t(gid, 'ph_0_or_1')),
                textInput('caps', t(gid, 'panel_auto_caps'), String(c.caps ? 1 : 0), t(gid, 'ph_0_or_1')),
                textInput('spam', t(gid, 'panel_auto_spam'), String(c.spam ? 1 : 0), t(gid, 'ph_0_or_1')),
                textInput('action', t(gid, 'panel_auto_action'), c.action),
            ],
        }],
    };
}

function automodWordsModal(c, gid) {
    return {
        custom_id: 'foxcraft:panel-modal:automod:words',
        title: t(gid, 'panel_automod_words_title'),
        components: [{
            type: 1, components: [
                textInput('words', t(gid, 'panel_auto_words'), c.bannedWords?.join(', ') || '', t(gid, 'ph_words')),
            ],
        }],
    };
}

function automodExceptionsModal(c, gid) {
    return {
        custom_id: 'foxcraft:panel-modal:automod:exceptions',
        title: t(gid, 'panel_automod_exceptions_title'),
        components: [{
            type: 1, components: [
                textInput('roles', t(gid, 'panel_auto_exc_roles'), c.whitelistRoles?.join(', ') || '', t(gid, 'ph_role_ids')),
                textInput('channels', t(gid, 'panel_auto_exc_channels'), c.whitelistChannels?.join(', ') || '', t(gid, 'ph_channel_ids')),
            ],
        }],
    };
}

// ---- command ---------------------------------------------------------------

module.exports = {
    data: new SlashCommandBuilder()
        .setName('panel')
        .setDescription('Bot control panel (owner only)'),
    aliases: ['dashboard', 'panel-embed', 'ayarlar'],
    async execute(interaction) {
        const userId = interaction.user?.id || interaction.member?.user?.id;
        if (!isOwner(userId)) return ephemeralReply(t(interaction.guild_id, 'perm_panel_owner'));
        const res = publicReply(null, [panelEmbed(interaction.guild_id)]);
        res.data.components = panelComponents(interaction.guild_id);
        return res;
    },
    async prefixExecute(message) {
        if (!isOwner(message.author.id)) return message.reply(t(message.guild?.id, 'perm_panel_owner'));
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
    const mod = MODULES.find((m) => m.key === key);
    const label = mod ? t(ctx.guildId, mod.labelKey) : key;
    await updatePanel(ctx, t(ctx.guildId, modules[key].enabled ? 'panel_toggle_on_msg' : 'panel_toggle_off_msg', { label }));
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
            return ctx.showModal(welcomerModal(mod, ctx.guildId));
        case 'sayma':
            return ctx.showModal(saymaModal(mod, ctx.guildId));
        case 'ticket':
            return ctx.showModal(ticketModal(mod, ctx.guildId));
        case 'qeydiyyat':
            return ctx.showModal(qeydiyyatModal(mod, ctx.guildId));
        case 'modlog':
            return ctx.showModal({
                custom_id: 'foxcraft:panel-modal:modlog',
                title: t(ctx.guildId, 'panel_modlog_title'),
                components: [{
                    type: 1, components: [textInput('kanal', t(ctx.guildId, 'panel_modlog_channel'), mod.channel || '', t(ctx.guildId, 'logstatus_channel_id'))],
                }],
            });
        case 'automod':
            await ctx.update({
                embeds: [foxcraftEmbed(t(ctx.guildId, 'panel_automod_settings_title'), t(ctx.guildId, 'panel_automod_pick'))],
                components: rows(select('foxcraft:panel-auto-menu', t(ctx.guildId, 'panel_auto_param'), [
                    { label: t(ctx.guildId, 'panel_auto_filters_label'), value: 'filter', emoji: '\u{1F50E}' },
                    { label: t(ctx.guildId, 'automod_banned_words'), value: 'words', emoji: '\u{1F6B7}' },
                    { label: t(ctx.guildId, 'panel_auto_exceptions_label'), value: 'exceptions', emoji: '\u26D4' },
                ], 1, 1)),
            });
            return;
        default:
            return ctx.reply({ content: t(ctx.guildId, 'panel_no_modal'), ephemeral: true });
    }
}));

registerComponent('foxcraft:panel-auto-menu', (ctx) => denyOrRun(ctx, async () => {
    const purpose = ctx.values[0] || 'filter';
    const cfg = getModules(ctx.guildId).automod || {};
    if (purpose === 'filter') return ctx.showModal(automodFilterModal(cfg, ctx.guildId));
    if (purpose === 'words') return ctx.showModal(automodWordsModal(cfg, ctx.guildId));
    return ctx.showModal(automodExceptionsModal(cfg, ctx.guildId));
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
        return ctx.reply({ content: t(ctx.guildId, 'panel_unknown'), ephemeral: true });
    }

    updateGuildData(ctx.guildId, { modules });
    await updatePanel(ctx, t(ctx.guildId, 'panel_saved'));
}));

registerComponent('foxcraft:panel-restart', (ctx) => denyOrRun(ctx, async () => {
    await ctx.update({
        content: t(ctx.guildId, 'panel_restart_confirm'),
        embeds: [],
        components: rows(
            button('foxcraft:panel-restart-confirm', t(ctx.guildId, 'restart_yes'), 4, null),
            button('foxcraft:panel-restart-cancel', t(ctx.guildId, 'panel_no'), 2, null),
        ),
    });
}));

registerComponent('foxcraft:panel-restart-cancel', (ctx) => denyOrRun(ctx, async () => {
    const embed = panelEmbed(ctx.guildId);
    await ctx.update({ embeds: [embed], components: panelComponents(ctx.guildId), content: undefined });
}));

registerComponent('foxcraft:panel-restart-confirm', (ctx) => denyOrRun(ctx, async () => {
    if (!isOwner(ctx.user?.id)) return;
    await ctx.reply({ content: t(ctx.guildId, 'panel_restarting'), ephemeral: false });
    setTimeout(() => process.exit(0), 1200);
}));