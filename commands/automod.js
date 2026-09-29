const { SlashCommandBuilder } = require('discord.js');
const { publicReply, ephemeralReply } = require('../utils/interaction');
const { getModules, setModules } = require('../utils/db');
const { foxcraftEmbed } = require('../utils/foxcraft');
const { registerComponent, button, select, rows } = require('../utils/ui');
const { can } = require('../utils/moderation');
const { PermissionFlagsBits } = require('discord.js');
const { t } = require('../utils/lang');

const FILTERS = [
    { key: 'links', labelKey: 'automod_filter_links', emoji: '🔗' },
    { key: 'invites', labelKey: 'automod_filter_invites', emoji: '📨' },
    { key: 'caps', labelKey: 'automod_filter_caps', emoji: '🔤' },
    { key: 'spam', labelKey: 'automod_filter_spam', emoji: '🚫' },
    { key: 'words', labelKey: 'automod_banned_words', emoji: '🚷' },
];

const ACTIONS = [
    { key: 'delete', labelKey: 'automod_action_delete', emoji: '🗑️' },
    { key: 'warn', labelKey: 'automod_action_warn', emoji: '⚠️' },
    { key: 'timeout', labelKey: 'automod_action_timeout', emoji: '⏱️' },
];

function statusEmbed(modules, cfg, guildId) {
    const lines = FILTERS.map((f) => {
        const on = cfg[f.key] === true;
        return `${on ? '✅' : '❌'} **${t(guildId, f.labelKey)}**`;
    });
    const actionLabel = ACTIONS.find((a) => a.key === cfg.action)?.labelKey;
    const action = actionLabel ? t(guildId, actionLabel) : cfg.action;
    const none = t(guildId, 'automod_none');
    return foxcraftEmbed(
        t(guildId, 'automod_title'),
        t(guildId, 'automod_status_line', { status: modules.automod?.enabled ? t(guildId, 'automod_enabled') : t(guildId, 'automod_disabled') })
            + `\n\n${lines.join('\n')}\n\n`
            + t(guildId, 'automod_action_line', { action }),
        [
            { name: t(guildId, 'automod_banned_words'), value: cfg.bannedWords?.length ? cfg.bannedWords.join(', ') : none, inline: true },
            { name: t(guildId, 'automod_exempt_roles'), value: cfg.whitelistRoles?.length ? cfg.whitelistRoles.map((r) => `<@&${r}>`).join(' ') : none, inline: true },
            { name: t(guildId, 'automod_exempt_channels'), value: cfg.whitelistChannels?.length ? cfg.whitelistChannels.map((c) => `<#${c}>`).join(' ') : none, inline: true },
        ]
    );
}

function buildComponents(guildId) {
    const cfg = getModules(guildId).automod;
    return rows(
        select('foxcraft:automod-toggle', t(guildId, 'automod_select_filters'), FILTERS.map((f) => ({
            label: t(guildId, f.labelKey), value: f.key, emoji: f.emoji,
            description: t(guildId, cfg[f.key] === true ? 'automod_desc_on' : 'automod_desc_off'),
            default: cfg[f.key] === true,
        })), 0, FILTERS.length),
        select('foxcraft:automod-action', t(guildId, 'automod_select_action'), ACTIONS.map((a) => ({
            label: t(guildId, a.labelKey), value: a.key, emoji: a.emoji, default: a.key === cfg.action,
        })), 1, 1),
        [button('foxcraft:automod-module', t(guildId, getModules(guildId).automod?.enabled ? 'automod_disable' : 'automod_enable'), getModules(guildId).automod?.enabled ? 4 : 3, getModules(guildId).automod?.enabled ? '❌' : '✅')],
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
        await ctx.reply({ content: t(ctx.guildId, 'automod_perm'), ephemeral: true });
        return;
    }
    const modules = getModules(ctx.guildId);
    modules.automod = { ...modules.automod, ...fn(modules.automod || {}) };
    setModules(ctx.guildId, modules);
    await ctx.update({
        embeds: [statusEmbed(modules, modules.automod, ctx.guildId)],
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
    data: new SlashCommandBuilder().setName('automod').setDescription('Manages the automod filters'),
    async execute(interaction) {
        const modules = getModules(interaction.guild_id);
        const base = publicReply(null, [statusEmbed(modules, modules.automod, interaction.guild_id)]);
        base.data.components = buildComponents(interaction.guild_id);
        return base;
    },
    async prefixExecute(message) {
        const modules = getModules(message.guild.id);
        return message.reply({ embeds: [statusEmbed(modules, modules.automod, message.guild.id)], components: buildComponents(message.guild.id) });
    },
    statusEmbed,
    buildComponents,
    registerComponents,
};