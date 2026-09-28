const { SlashCommandBuilder } = require('discord.js');
const { publicReply, ephemeralReply } = require('../utils/interaction');
const { getModules, setModules } = require('../utils/db');
const { foxcraftEmbed } = require('../utils/foxcraft');
const { registerComponent, button, select, rows } = require('../utils/ui');
const { can } = require('../utils/moderation');
const { PermissionFlagsBits } = require('discord.js');

const FILTERS = [
    { key: 'links', label: 'Keçidlər', emoji: '🔗' },
    { key: 'invites', label: 'Dəvət linkləri', emoji: '📨' },
    { key: 'caps', label: 'Böyük hərflər', emoji: '🔤' },
    { key: 'spam', label: 'Spam/Flood', emoji: '🚫' },
    { key: 'words', label: 'Qadağan sözlər', emoji: '🚷' },
];

const ACTIONS = [
    { key: 'delete', label: 'Mesajı sil', emoji: '🗑️' },
    { key: 'warn', label: 'Xəbərdarlıq', emoji: '⚠️' },
    { key: 'timeout', label: 'Zaman aşımı (10 dəq)', emoji: '⏱️' },
];

function statusEmbed(modules, cfg) {
    const lines = FILTERS.map((f) => {
        const on = cfg[f.key] === true;
        return `${on ? '✅' : '❌'} **${f.label}**`;
    });
    const action = ACTIONS.find((a) => a.key === cfg.action)?.label || cfg.action;
    return foxcraftEmbed(
        '🛡️ Automod',
        `Status: **${modules.automod?.enabled ? '✅ Aktiv' : '❌ Deaktiv'}**\n\n${lines.join('\n')}\n\n` +
        `**Hərəkət:** ${action}`,
        [
            { name: 'Qadağan sözlər', value: cfg.bannedWords?.length ? cfg.bannedWords.join(', ') : 'Yoxdur', inline: true },
            { name: 'İstisna rollar', value: cfg.whitelistRoles?.length ? cfg.whitelistRoles.map((r) => `<@&${r}>`).join(' ') : 'Yoxdur', inline: true },
            { name: 'İstisna kanallar', value: cfg.whitelistChannels?.length ? cfg.whitelistChannels.map((c) => `<#${c}>`).join(' ') : 'Yoxdur', inline: true },
        ]
    );
}

function buildComponents(guildId) {
    const cfg = getModules(guildId).automod;
    return rows(
        select('foxcraft:automod-toggle', 'Süzgəcləri seç', FILTERS.map((f) => ({
            label: f.label, value: f.key, emoji: f.emoji,
            description: cfg[f.key] === true ? 'Aktiv — söndürmək üçün seçimi qaldır' : 'Deaktiv — aktivləşdirmək üçün seç',
            default: cfg[f.key] === true,
        })), 0, FILTERS.length),
        select('foxcraft:automod-action', 'Hərəkəti seç', ACTIONS.map((a) => ({
            label: a.label, value: a.key, emoji: a.emoji, default: a.key === cfg.action,
        })), 1, 1),
        [button('foxcraft:automod-module', getModules(guildId).automod?.enabled ? 'Deaktiv et' : 'Aktiv et', getModules(guildId).automod?.enabled ? 4 : 3, getModules(guildId).automod?.enabled ? '❌' : '✅')],
    );
}

function requirePerm(ctx) {
    return Boolean(
        ctx.member &&
        (typeof ctx.member.permissions?.has === 'function'
            ? ctx.member.permissions.has(PermissionFlagsBits.ManageGuild)
            : (BigInt(ctx.member.permissions || '0') & BigInt(PermissionFlagsBits.ManageGuild)) === BigInt(PermissionFlagsBits.ManageGuild))
    );
}

async function applyConfig(ctx, fn) {
    if (!requirePerm(ctx)) {
        await ctx.reply({ content: 'Bu əməliyyat üçün Manage Guild icazəsi lazımdır.', ephemeral: true });
        return;
    }
    const modules = getModules(ctx.guildId);
    modules.automod = { ...modules.automod, ...fn(modules.automod || {}) };
    setModules(ctx.guildId, modules);
    await ctx.update({
        embeds: [statusEmbed(modules, modules.automod)],
        components: buildComponents(ctx.guildId),
    });
}

function registerComponents() {
    registerComponent('foxcraft:automod-toggle', (ctx) => applyConfig(ctx, (cfg) => {
        const enabled = ctx.values || [];
        const next = { ...cfg };
        for (const f of FILTERS) next[f.key] = enabled.includes(f.key);
        return next;
    }));
    registerComponent('foxcraft:automod-action', (ctx) => applyConfig(ctx, (cfg) => ({
        ...cfg,
        action: ctx.values[0] || cfg.action,
    })));
    registerComponent('foxcraft:automod-module', (ctx) => applyConfig(ctx, (cfg) => ({
        ...cfg,
        enabled: !(cfg.enabled === true),
    })));
}

module.exports = {
    data: new SlashCommandBuilder().setName('automod').setDescription('Automod süzgəclərini idarə edir'),
    async execute(interaction) {
        const modules = getModules(interaction.guild_id);
        const base = publicReply(null, [statusEmbed(modules, modules.automod)]);
        base.data.components = buildComponents(interaction.guild_id);
        return base;
    },
    async prefixExecute(message) {
        const modules = getModules(message.guild.id);
        return message.reply({ embeds: [statusEmbed(modules, modules.automod)], components: buildComponents(message.guild.id) });
    },
    statusEmbed,
    buildComponents,
    registerComponents,
};