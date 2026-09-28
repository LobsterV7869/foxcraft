/**
 * Automod: link filter, invite filter, caps filter, spam/flood and banned
 * words. Per-guild config lives in SQLite (see utils/db.js) and can be tuned
 * from the /panel Eyarlar and /automod. Whitelisted roles/channels are skipped.
 */

const { PermissionFlagsBits } = require('discord.js');
const { getModules } = require('./db');

const spamWindows = new Map();

function memberHasRole(member, roleId) {
    if (!member || !roleId) return false;
    const roles = member.roles;
    if (roles && roles.cache) return roles.cache.has(roleId);
    if (Array.isArray(roles)) return roles.includes(roleId);
    return false;
}

function isWhitelisted(member, channel, config) {
    if (channel && config.whitelistChannels?.includes(channel.id)) return true;
    return (config.whitelistRoles || []).some((roleId) => memberHasRole(member, roleId));
}

function countLinks(text) {
    return (text.match(/https?:\/\/(?!discord)\S+/gi) || []).length;
}

function findInvite(text) {
    const match = text.match(/(?:discord\.(?:gg|com\/invite)\/)[a-z0-9_-]+/gi);
    return match ? match[0] : null;
}

function isMostlyCaps(text, config) {
    const letters = (text.match(/[a-zA-ZəğıöüçşƏĞIİÖÜÇŞ]/gi) || []).length;
    if (letters < (config.capsMinLength || 6)) return false;
    const upper = (text.match(/[A-ZƏĞIİÖÜÇŞ]/g) || []).length;
    return upper / letters >= (config.capsThreshold || 0.6);
}

function hasBannedWord(text, config) {
    const words = (config.bannedWords || [])
        .map((word) => String(word).trim().toLowerCase())
        .filter(Boolean);
    if (!words.length) return false;
    return words.some((word) => text.toLowerCase().includes(word));
}

function isFlooding(guildId, channelId, authorId, config) {
    const key = `${guildId}:${channelId}:${authorId}`;
    const now = Date.now();
    const window = config.spamWindowMs || 5000;
    const items = (spamWindows.get(key) || []).filter((t) => now - t < window);
    items.push(now);
    spamWindows.set(key, items);
    return items.length >= (config.spamThreshold || 5);
}

/**
 * Runs automod on a message. Returns true when the message was consumed
 * (deleted/flagged), false otherwise. Never throws.
 */
async function handleMessage(message, client) {
    if (!message.guild || message.author.bot) return false;
    if (message.content?.startsWith('!')) return false;
    const config = getModules(message.guild.id).automod;
    if (!config || config.enabled !== true) return false;
    if (config.action === 'timeout' && !message.channel.permissionsFor?.(message.guild.members.me)
        ?.has(PermissionFlagsBits.ModerateMembers)) {
        // fall back to delete when the bot cannot timeout
        config.action = 'delete';
    }

    const text = message.content || '';
    let reason = null;

    if (config.links && countLinks(text) > 0) reason = 'Keçid paylaşma qadağandır (link filtresi).';
    else if (config.invites && findInvite(text)) reason = `Server dəvət linki paylaşmaq qadağandır (${findInvite(text)}).`;
    else if (config.caps && isMostlyCaps(text, config)) reason = 'Böyük hərflərlə yazmaq qadağandır (caps filtresi).';
    else if (config.spam && isFlooding(message.guild.id, message.channel?.id, message.author.id, config)) reason = 'Spam/flood aşkarlandı.';
    else if (config.words && hasBannedWord(text, config)) reason = 'Qadağan edilmiş sözdən istifadə olundu.';

    if (!reason) return false;
    if (isWhitelisted(message.member, message.channel, config)) return false;

    const tag = message.author.tag;
    const emoji = {
        delete: '🗑️',
        warn: '⚠️',
        timeout: '⏱️',
    }[config.action] || '🗑️';

    if (config.action === 'delete') {
        await message.delete().catch(() => {});
        await message.channel.send(`${emoji} ${tag}: ${reason}`)
            .then((m) => setTimeout(() => m.delete().catch(() => {}), 5000))
            .catch(() => {});
    } else if (config.action === 'warn') {
        try {
            await message.member?.send(`⚠️ **Hesabat:** ${reason}\nKanal: ${message.channel}\n\nBot qaydalarına əməl et.`).catch(() => {});
        } catch {
            /* DM closed */
        }
        await message.channel.send(`${emoji} ${tag}: ${reason}`)
            .then((m) => setTimeout(() => m.delete().catch(() => {}), 8000))
            .catch(() => {});
    } else if (config.action === 'timeout') {
        await message.member?.timeout(10 * 60 * 1000, reason).catch(() => {});
        await message.channel.send(`${emoji} ${tag}, 10 dəqiqəlik səssizləşdirildin: ${reason}`).catch(() => {});
    }
    return true;
}

/** Called once when the automod module is toggled off, to reset state. */
function reset() {
    spamWindows.clear();
}

module.exports = { handleMessage, reset };