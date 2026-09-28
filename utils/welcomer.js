/**
 * Welcomer: configurable welcome/leave messages, optional auto-role and DM.
 * Placeholders: {user}, {username}, {server}, {membercount}.
 */

const { getModules } = require('./db');

function fillPlaceholders(text, member) {
    return String(text == null ? '' : text)
        .replaceAll('{user}', `<@${member.id}>`)
        .replaceAll('{username}', member.user?.username || member.displayName || member.userTag || member.user?.tag || 'Üzv')
        .replaceAll('{server}', member.guild?.name || 'Server')
        .replaceAll('{membercount}', String(member.guild?.memberCount ?? member.guild?.approximateMemberCount ?? '?'));
}

/**
 * Handles a new member join. Returns true when the welcomer module produced
 * any output for the member (message, DM or role).
 */
async function onMemberAdd(member) {
    try {
        const config = getModules(member.guild.id).welcomer;
        if (!config || config.enabled !== true) return false;
        let acted = false;

        if (config.autoRole) {
            const role = member.guild.roles.cache.get(config.autoRole)
                || await member.guild.roles.fetch(config.autoRole).catch(() => null);
            if (role) {
                const added = await member.roles.add(role, 'Welcomer avto-rol')
                    .then(() => true)
                    .catch(() => false);
                if (added) acted = true;
            }
        }

        if (config.dm) {
            const dmText = fillPlaceholders(config.dmMessage || config.message, member)
                .replaceAll('<@', '')
                .replaceAll('>', '');
            const sent = await member.send(dmText).then(() => true).catch(() => false);
            if (sent) acted = true;
        }

        if (config.channel) {
            const channel = await member.guild.channels.fetch(config.channel).catch(() => null);
            if (channel?.isTextBased()) {
                await channel.send(fillPlaceholders(config.message, member)).catch(() => {});
                acted = true;
            }
        }
        return acted;
    } catch {
        return false;
    }
}

/**
 * Handles a member leaving. Returns true when a leave message was sent.
 */
async function onMemberRemove(member) {
    try {
        const config = getModules(member.guild.id).welcomer;
        if (!config || config.enabled !== true || !config.leaveChannel) return false;
        const channel = await member.guild.channels.fetch(config.leaveChannel).catch(() => null);
        if (!channel?.isTextBased()) return false;
        await channel.send(fillPlaceholders(config.leaveMessage, member)).catch(() => {});
        return true;
    } catch {
        return false;
    }
}

module.exports = { onMemberAdd, onMemberRemove, fillPlaceholders };