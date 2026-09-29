const {
    AuditLogEvent,
    ChannelType,
    EmbedBuilder,
    PermissionFlagsBits,
} = require('discord.js');
const { getLogChannelId } = require('./storage');
const { envValue } = require('./foxcraft');
const { t } = require('./lang');

// Standard Colors
const COLORS = {
    RED: 0xED4245,       // Deletes, bans, kicks, removals
    BLUE: 0x3498DB,      // Edits, updates
    GREEN: 0x57F287,     // Joins, creations, unbans
    YELLOW: 0xF1C40F,    // Nickname, server changes
    BLURPLE: 0x5865F2,   // Roles added, voice move
    ORANGE: 0xE67E22,    // Roles removed
    TEAL: 0x1ABC9C,      // Voice join
    GREY: 0x95A5A6,      // Voluntary leave, voice leave
};

// resolved per-guild via t() at the call site below



/**
 * Resolves the configured log channel for a guild.
 * Checks per-guild persistence first, then FOXCRAFT_LOG_CHANNEL_ID,
 * and falls back to a channel named 'mod-log' or the legacy
 * '🛡️・mod-loglar' name used by older setups.
 */
async function getLogChannel(guild) {
    if (!guild) return null;

    // 1. Check saved guild log channel
    const savedId = await getLogChannelId(guild.id);
    if (savedId) {
        const channel = guild.channels.cache.get(savedId) || await guild.channels.fetch(savedId).catch(() => null);
        if (channel && channel.isTextBased()) return channel;
    }

    // 2. Check environment variable fallback
    const envId = envValue('FOXCRAFT_LOG_CHANNEL_ID');
    if (envId) {
        const channel = guild.channels.cache.get(envId) || await guild.channels.fetch(envId).catch(() => null);
        if (channel && channel.isTextBased()) return channel;
    }

    // 3. Fallback by name if existing
    const named = guild.channels.cache.find(c => (c.name === 'mod-log' || c.name === '🛡️・mod-loglar') && c.isTextBased());
    if (named) return named;

    return null;
}

/**
 * Checks whether the bot has required permissions to send embeds in the channel.
 */
function hasSendPermissions(channel, guild) {
    if (!channel || !channel.isTextBased()) return false;
    const me = guild.members.me;
    if (!me) return false;
    const perms = channel.permissionsFor(me);
    if (!perms) return false;
    return perms.has([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
    ]);
}

/**
 * Dispatches an embed to the server's log channel.
 * Gracefully exits without throwing or spamming if no channel is set or permissions are lacking.
 */
async function sendEmbed(guild, embed) {
    try {
        if (!guild) return;
        const channel = await getLogChannel(guild);
        if (!channel) return; // Logging not configured or channel deleted; do not spam
        if (!hasSendPermissions(channel, guild)) return; // Missing permissions; suppress quietly

        await channel.send({ embeds: [embed] }).catch((err) => {
            // Ignore common permission / missing access errors to prevent spam
            if (err.code === 50013 || err.code === 50001 || err.code === 10003) return;
            console.error('[LOGGER] Message not sent:', err.message);
        });
    } catch (error) {
        // Suppress unexpected logging exceptions to avoid crashing the bot
    }
}

/**
 * Helper to safely query audit logs for executor information.
 */
async function findAuditExecutor(guild, actionType, targetId, maxAgeMs = 15000) {
    try {
        const me = guild.members.me;
        if (!me || !me.permissions.has(PermissionFlagsBits.ViewAuditLog)) return null;

        const logs = await guild.fetchAuditLogs({ type: actionType, limit: 5 }).catch(() => null);
        if (!logs) return null;

        const now = Date.now();
        const entry = logs.entries.find((item) => {
            const age = now - item.createdTimestamp;
            if (age > maxAgeMs) return false;
            if (targetId) {
                if (item.target?.id === targetId) return true;
                if (item.extra?.channel?.id === targetId) return true;
                return false;
            }
            return true;
        });

        return entry || null;
    } catch {
        return null;
    }
}

function truncate(str, max = 1024) {
    if (!str) return '';
    return str.length > max ? str.slice(0, max - 3) + '...' : str;
}

function channelTypeName(type, gid) {
    switch (type) {
        case ChannelType.GuildText: return 'Text';
        case ChannelType.GuildVoice: return t(gid, 'log_type_voice');
        case ChannelType.GuildCategory: return t(gid, 'log_type_category');
        case ChannelType.GuildAnnouncement: return t(gid, 'log_type_announcement');
        case ChannelType.GuildStageVoice: return t(gid, 'log_type_stage');
        case ChannelType.GuildForum: return t(gid, 'log_type_forum');
        default: return t(gid, 'log_type_other');
    }
}

// ==============================================================================
// LOG EVENT HANDLERS
// ==============================================================================

async function onMessageDelete(message, messageSnapshots = null) {
    if (!message.guild) return;

    // Check memory snapshot if message was partial / uncached
    const snapshot = messageSnapshots ? messageSnapshots.get(message.id) : null;
    const authorTag = snapshot?.author || message.author?.tag || t(message.guild?.id, 'log_unknown_author');
    const authorId = message.author?.id || 'unknown-id';
    const authorMention = message.author ? `<@${message.author.id}>` : authorTag;
    const channelName = snapshot?.channelName || message.channel?.name || 'unknown-channel';
    const rawContent = snapshot?.content || message.content;
    const content = rawContent ? truncate(rawContent) : t(message.guild?.id, 'log_not_in_cache');

    // Audit log check for who deleted the message
    const audit = await findAuditExecutor(message.guild, AuditLogEvent.MessageDelete, message.id);
    const executorText = audit?.executor ? `${audit.executor.tag} (\`${audit.executor.id}\`)` : 'Author or not determined';

    const fields = [
        { name: t(message.guild?.id, 'log_title_author'), value: `${authorMention} (${authorTag})`, inline: true },
        { name: t(message.guild?.id, 'log_title_channel'), value: `${message.channel || `#${channelName}`}`, inline: true },
        { name: t(message.guild?.id, 'log_field_deleted_by'), value: executorText, inline: true },
        { name: t(message.guild?.id, 'log_field_content'), value: content, inline: false },
    ];

    // Attachments info if present
    if (message.attachments && message.attachments.size > 0) {
        const fileNames = message.attachments.map(a => `• \`${a.name}\``).join('\n');
        fields.push({ name: `Attachments (${message.attachments.size})`, value: truncate(fileNames, 1024), inline: false });
    }

    const embed = new EmbedBuilder()
        .setTitle(t(message.guild?.id, 'log_title_message'))
        .setColor(COLORS.RED)
        .addFields(fields)
        .setFooter({ text: `Message ID: ${message.id} | Author ID: ${authorId}` })
        .setTimestamp();

    await sendEmbed(message.guild, embed);
}

async function onMessageDeleteBulk(messages, messageSnapshots = null) {
    const first = messages.first();
    if (!first || !first.guild) return;

    const audit = await findAuditExecutor(first.guild, AuditLogEvent.MessageBulkDelete, first.channel.id);
    const executorText = audit?.executor ? `${audit.executor.tag} (\`${audit.executor.id}\`)` : t(first.guild?.id, 'log_not_determined');

    const samples = messages
        .map((msg) => {
            const snapshot = messageSnapshots ? messageSnapshots.get(msg.id) : null;
            const author = snapshot?.author || msg.author?.tag || t(first.guild?.id, 'log_unknown');
            const text = snapshot?.content || msg.content || t(first.guild?.id, 'log_not_in_cache');
            return `**${author}:** ${truncate(text, 100)}`;
        })
        .slice(0, 5)
        .join('\n');

    const fields = [
        { name: t(first.guild?.id, 'log_title_channel'), value: `${first.channel}`, inline: true },
        { name: t(first.guild?.id, 'log_field_messages_deleted'), value: `\`${messages.size}\``, inline: true },
        { name: t(first.guild?.id, 'log_field_deleted_by'), value: executorText, inline: true },
    ];

    if (samples) {
        fields.push({ name: t(first.guild?.id, 'log_field_sample'), value: truncate(samples, 1024), inline: false });
    }

    const embed = new EmbedBuilder()
        .setTitle(t(first.guild?.id, 'log_title_bulk_deleted'))
        .setColor(COLORS.RED)
        .addFields(fields)
        .setFooter({ text: t(first.guild?.id, 'log_channel_id_footer', { id: first.channel.id }) })
        .setTimestamp();

    await sendEmbed(first.guild, embed);
}

async function onMessageUpdate(oldMessage, newMessage) {
    if (!newMessage.guild || newMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return; // Ignore pin/embed updates

    const oldText = oldMessage.content ? truncate(oldMessage.content) : t(newMessage.guild?.id, 'log_was_not_in_cache');
    const newText = newMessage.content ? truncate(newMessage.content) : t(newMessage.guild?.id, 'log_content_empty');

    const embed = new EmbedBuilder()
        .setTitle(t(newMessage.guild?.id, 'log_title_message_edited'))
        .setColor(COLORS.BLUE)
        .addFields([
            { name: t(newMessage.guild?.id, 'log_title_author'), value: `${newMessage.author} (\`${newMessage.author.tag}\`)`, inline: true },
            { name: t(newMessage.guild?.id, 'log_title_channel'), value: `${newMessage.channel}`, inline: true },
            { name: t(newMessage.guild?.id, 'log_field_link'), value: `[Open message](${newMessage.url})`, inline: true },
            { name: t(newMessage.guild?.id, 'log_field_old_content'), value: oldText, inline: false },
            { name: t(newMessage.guild?.id, 'log_field_new_content'), value: newText, inline: false },
        ])
        .setFooter({ text: `Message ID: ${newMessage.id} | Author ID: ${newMessage.author.id}` })
        .setTimestamp();

    await sendEmbed(newMessage.guild, embed);
}

async function onGuildMemberAdd(member) {
    if (!member.guild) return;

    const createdTime = Math.floor(member.user.createdTimestamp / 1000);

    const embed = new EmbedBuilder()
        .setTitle(t(member.guild?.id, 'log_title_member_joined'))
        .setColor(COLORS.GREEN)
        .addFields([
            { name: t(member.guild?.id, 'log_field_user'), value: `${member.user} (\`${member.user.tag}\`)`, inline: true },
            { name: t(member.guild?.id, 'field_id'), value: `\`${member.id}\``, inline: true },
            { name: t(member.guild?.id, 'log_field_member_count'), value: `\`${member.guild.memberCount}\``, inline: true },
            { name: t(member.guild?.id, 'log_field_account_created'), value: `<t:${createdTime}:F> (<t:${createdTime}:R>)`, inline: false },
        ])
        .setFooter({ text: `User ID: ${member.id}` })
        .setTimestamp();

    if (typeof member.user?.displayAvatarURL === 'function') {
        embed.setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }));
    }

    await sendEmbed(member.guild, embed);
}

async function onGuildMemberRemove(member) {
    if (!member.guild) return;

    // Check if the member was kicked
    const kickAudit = await findAuditExecutor(member.guild, AuditLogEvent.MemberKick, member.id);
    const isKick = Boolean(kickAudit);

    if (isKick) {
        const executor = kickAudit.executor ? `${kickAudit.executor.tag} (\`${kickAudit.executor.id}\`)` : t(member.guild?.id, 'log_not_determined');
        const reason = kickAudit.reason || t(member.guild?.id, 'log_no_reason');

        const embed = new EmbedBuilder()
            .setTitle(t(member.guild?.id, 'log_title_member_kicked'))
            .setColor(COLORS.RED)
            .addFields([
                { name: t(member.guild?.id, 'log_field_member'), value: `${member.user?.tag || member.id} (\`${member.id}\`)`, inline: true },
                { name: t(member.guild?.id, 'log_field_kicked_by'), value: executor, inline: true },
                { name: t(member.guild?.id, 'reason'), value: reason, inline: false },
            ])
            .setFooter({ text: `User ID: ${member.id}` })
            .setTimestamp();

        if (typeof member.user?.displayAvatarURL === 'function') {
            embed.setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }));
        }

        return sendEmbed(member.guild, embed);
    }

    // Voluntary departure
    const joinedTimestamp = member.joinedTimestamp ? Math.floor(member.joinedTimestamp / 1000) : null;
    const joinedText = joinedTimestamp ? `<t:${joinedTimestamp}:F> (<t:${joinedTimestamp}:R>)` : t(member.guild?.id, 'log_unknown');

    const embed = new EmbedBuilder()
        .setTitle(t(member.guild?.id, 'log_title_member_left'))
        .setColor(COLORS.GREY)
        .addFields([
            { name: t(member.guild?.id, 'log_field_user'), value: `${member.user?.tag || member.id} (\`${member.id}\`)`, inline: true },
            { name: t(member.guild?.id, 'log_field_remaining'), value: `\`${member.guild.memberCount}\``, inline: true },
            { name: t(member.guild?.id, 'log_field_joined_on'), value: joinedText, inline: false },
        ])
        .setFooter({ text: `User ID: ${member.id}` })
        .setTimestamp();

    if (typeof member.user?.displayAvatarURL === 'function') {
        embed.setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }));
    }

    await sendEmbed(member.guild, embed);
}

async function onGuildBanAdd(ban) {
    if (!ban.guild) return;

    const audit = await findAuditExecutor(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
    const executor = audit?.executor ? `${audit.executor.tag} (\`${audit.executor.id}\`)` : t(ban.guild?.id, 'log_not_determined');
    const reason = ban.reason || audit?.reason || t(ban.guild?.id, 'log_no_reason');

    const embed = new EmbedBuilder()
        .setTitle(t(ban.guild?.id, 'log_title_member_banned'))
        .setColor(COLORS.RED)
        .addFields([
            { name: t(ban.guild?.id, 'log_field_banned_user'), value: `${ban.user.tag} (\`${ban.user.id}\`)`, inline: true },
            { name: t(ban.guild?.id, 'log_field_banned_by'), value: executor, inline: true },
            { name: t(ban.guild?.id, 'reason'), value: reason, inline: false },
        ])
        .setFooter({ text: `User ID: ${ban.user.id}` })
        .setTimestamp();

    if (typeof ban.user?.displayAvatarURL === 'function') {
        embed.setThumbnail(ban.user.displayAvatarURL({ dynamic: true, size: 256 }));
    }

    await sendEmbed(ban.guild, embed);
}

async function onGuildBanRemove(ban) {
    if (!ban.guild) return;

    const audit = await findAuditExecutor(ban.guild, AuditLogEvent.MemberBanRemove, ban.user.id);
    const executor = audit?.executor ? `${audit.executor.tag} (\`${audit.executor.id}\`)` : t(ban.guild?.id, 'log_not_determined');

    const embed = new EmbedBuilder()
        .setTitle(t(ban.guild?.id, 'log_title_member_unbanned'))
        .setColor(COLORS.GREEN)
        .addFields([
            { name: t(ban.guild?.id, 'log_field_user'), value: `${ban.user.tag} (\`${ban.user.id}\`)`, inline: true },
            { name: t(ban.guild?.id, 'log_field_unbanned_by'), value: executor, inline: true },
        ])
        .setFooter({ text: `User ID: ${ban.user.id}` })
        .setTimestamp();

    if (typeof ban.user?.displayAvatarURL === 'function') {
        embed.setThumbnail(ban.user.displayAvatarURL({ dynamic: true, size: 256 }));
    }

    await sendEmbed(ban.guild, embed);
}

async function onGuildMemberUpdate(oldMember, newMember) {
    if (!newMember.guild) return;

    // 1. Nickname Changed
    if (oldMember.nickname !== newMember.nickname) {
        const oldNick = oldMember.nickname || oldMember.user.username;
        const newNick = newMember.nickname || newMember.user.username;

        const embed = new EmbedBuilder()
            .setTitle(t(newMember.guild?.id, 'log_title_nickname'))
            .setColor(COLORS.YELLOW)
            .addFields([
                { name: t(newMember.guild?.id, 'log_field_member'), value: `${newMember.user} (\`${newMember.user.tag}\`)`, inline: true },
                { name: t(newMember.guild?.id, 'log_field_old_nickname'), value: `\`${oldNick}\``, inline: true },
                { name: t(newMember.guild?.id, 'log_field_new_nickname'), value: `\`${newNick}\``, inline: true },
            ])
            .setFooter({ text: `User ID: ${newMember.id}` })
            .setTimestamp();

        await sendEmbed(newMember.guild, embed);
    }

    // 2. Roles Added / Removed
    const oldRoles = oldMember.roles.cache;
    const newRoles = newMember.roles.cache;

    if (oldRoles.size !== newRoles.size) {
        const added = newRoles.filter(role => !oldRoles.has(role.id));
        const removed = oldRoles.filter(role => !newRoles.has(role.id));

        if (added.size > 0) {
            const addedList = added.map(r => `${r}`).join(', ');
            const embed = new EmbedBuilder()
                .setTitle(t(newMember.guild?.id, 'log_title_roles_added'))
                .setColor(COLORS.BLURPLE)
                .addFields([
                    { name: t(newMember.guild?.id, 'log_field_member'), value: `${newMember.user} (\`${newMember.user.tag}\`)`, inline: true },
                    { name: t(newMember.guild?.id, 'log_field_roles_added'), value: truncate(addedList, 1024), inline: false },
                ])
                .setFooter({ text: `User ID: ${newMember.id}` })
                .setTimestamp();

            await sendEmbed(newMember.guild, embed);
        }

        if (removed.size > 0) {
            const removedList = removed.map(r => `${r}`).join(', ');
            const embed = new EmbedBuilder()
                .setTitle(t(newMember.guild?.id, 'log_title_roles_removed'))
                .setColor(COLORS.ORANGE)
                .addFields([
                    { name: t(newMember.guild?.id, 'log_field_member'), value: `${newMember.user} (\`${newMember.user.tag}\`)`, inline: true },
                    { name: t(newMember.guild?.id, 'log_field_roles_removed'), value: truncate(removedList, 1024), inline: false },
                ])
                .setFooter({ text: `User ID: ${newMember.id}` })
                .setTimestamp();

            await sendEmbed(newMember.guild, embed);
        }
    }
}

async function onVoiceStateUpdate(oldState, newState) {
    const member = newState.member || oldState.member;
    const guild = newState.guild || oldState.guild;
    if (!member || member.user.bot || !guild) return;

    // Joined voice
    if (!oldState.channelId && newState.channelId) {
        const embed = new EmbedBuilder()
            .setTitle(t(newState.guild?.id, 'log_title_voice_join'))
            .setColor(COLORS.TEAL)
            .addFields([
                { name: t(newState.guild?.id, 'log_field_member'), value: `${member.user} (\`${member.user.tag}\`)`, inline: true },
                { name: t(newState.guild?.id, 'log_title_channel'), value: `\`${newState.channel?.name}\``, inline: true },
            ])
            .setFooter({ text: `User ID: ${member.id}` })
            .setTimestamp();

        await sendEmbed(guild, embed);
        return;
    }

    // Left voice
    if (oldState.channelId && !newState.channelId) {
        const embed = new EmbedBuilder()
            .setTitle(t(newState.guild?.id, 'log_title_voice_leave'))
            .setColor(COLORS.GREY)
            .addFields([
                { name: t(newState.guild?.id, 'log_field_member'), value: `${member.user} (\`${member.user.tag}\`)`, inline: true },
                { name: t(newState.guild?.id, 'log_title_channel'), value: `\`${oldState.channel?.name}\``, inline: true },
            ])
            .setFooter({ text: `User ID: ${member.id}` })
            .setTimestamp();

        await sendEmbed(guild, embed);
        return;
    }

    // Moved voice channel
    if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        const embed = new EmbedBuilder()
            .setTitle(t(newState.guild?.id, 'log_title_voice_move'))
            .setColor(COLORS.BLURPLE)
            .addFields([
                { name: t(newState.guild?.id, 'log_field_member'), value: `${member.user} (\`${member.user.tag}\`)`, inline: true },
                { name: t(newState.guild?.id, 'log_field_old_channel'), value: `\`${oldState.channel?.name}\``, inline: true },
                { name: t(newState.guild?.id, 'log_field_new_channel'), value: `\`${newState.channel?.name}\``, inline: true },
            ])
            .setFooter({ text: `User ID: ${member.id}` })
            .setTimestamp();

        await sendEmbed(guild, embed);
    }
}

async function onRoleCreate(role) {
    if (!role.guild) return;

    const hexColor = `#${role.color.toString(16).padStart(6, '0')}`;
    const embed = new EmbedBuilder()
        .setTitle(t(role.guild?.id, 'log_title_role_created'))
        .setColor(COLORS.GREEN)
        .addFields([
            { name: t(role.guild?.id, 'opt_panel_role'), value: `${role} (\`${role.name}\`)`, inline: true },
            { name: t(role.guild?.id, 'field_id'), value: `\`${role.id}\``, inline: true },
            { name: t(role.guild?.id, 'log_field_color'), value: `\`${hexColor}\``, inline: true },
            { name: t(role.guild?.id, 'log_field_displayed_separately'), value: role.hoist ? t(role.guild?.id, 'log_yes') : t(role.guild?.id, 'log_no'), inline: true },
            { name: t(role.guild?.id, 'log_field_can_be_mentioned'), value: role.mentionable ? t(role.guild?.id, 'log_yes') : t(role.guild?.id, 'log_no'), inline: true },
        ])
        .setFooter({ text: t(role.guild?.id, 'log_role_id_footer', { id: role.id }) })
        .setTimestamp();

    await sendEmbed(role.guild, embed);
}

async function onRoleDelete(role) {
    if (!role.guild) return;

    const embed = new EmbedBuilder()
        .setTitle(t(role.guild?.id, 'log_title_role_deleted'))
        .setColor(COLORS.RED)
        .addFields([
            { name: t(role.guild?.id, 'log_field_role_name'), value: `\`${role.name}\``, inline: true },
            { name: t(role.guild?.id, 'field_id'), value: `\`${role.id}\``, inline: true },
        ])
        .setFooter({ text: t(role.guild?.id, 'log_role_id_footer', { id: role.id }) })
        .setTimestamp();

    await sendEmbed(role.guild, embed);
}

async function onRoleUpdate(oldRole, newRole) {
    if (!newRole.guild) return;

    const changes = [];
    if (oldRole.name !== newRole.name) {
        changes.push(t(newRole.guild?.id, 'log_change_name', { old: `\`${oldRole.name}\``, new: `\`${newRole.name}\`` }));
    }
    if (oldRole.color !== newRole.color) {
        const oldHex = `#${oldRole.color.toString(16).padStart(6, '0')}`;
        const newHex = `#${newRole.color.toString(16).padStart(6, '0')}`;
        changes.push(t(newRole.guild?.id, 'log_change_color', { old: `\`${oldHex}\``, new: `\`${newHex}\`` }));
    }
    if (oldRole.hoist !== newRole.hoist) {
        changes.push(t(newRole.guild?.id, 'log_change_hoist', { old: `\`${oldRole.hoist}\``, new: `\`${newRole.hoist}\`` }));
    }
    if (oldRole.mentionable !== newRole.mentionable) {
        changes.push(t(newRole.guild?.id, 'log_change_mention', { old: `\`${oldRole.mentionable}\``, new: `\`${newRole.mentionable}\`` }));
    }
    if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) {
        changes.push(`• **${t(newRole.guild?.id, 'log_field_permissions')}:** ${t(newRole.guild?.id, 'log_change_permissions')}`);
    }

    if (changes.length === 0) return;

    const embed = new EmbedBuilder()
        .setTitle(t(newRole.guild?.id, 'log_title_role_updated'))
        .setColor(COLORS.BLUE)
        .addFields([
            { name: t(newRole.guild?.id, 'opt_panel_role'), value: `${newRole} (\`${newRole.name}\`)`, inline: true },
            { name: t(newRole.guild?.id, 'field_id'), value: `\`${newRole.id}\``, inline: true },
            { name: t(newRole.guild?.id, 'log_field_changes'), value: changes.join('\n'), inline: false },
        ])
        .setFooter({ text: t(newRole.guild?.id, 'log_role_id_footer', { id: newRole.id }) })
        .setTimestamp();

    await sendEmbed(newRole.guild, embed);
}

async function onChannelCreate(channel) {
    if (!channel.guild) return;

    const embed = new EmbedBuilder()
        .setTitle(t(channel.guild?.id, 'log_title_channel_created'))
        .setColor(COLORS.GREEN)
        .addFields([
            { name: t(channel.guild?.id, 'log_title_channel'), value: `${channel} (\`${channel.name}\`)`, inline: true },
            { name: t(channel.guild?.id, 'log_field_type'), value: channelTypeName(channel.type, channel.guild?.id), inline: true },
            { name: t(channel.guild?.id, 'help_category'), value: channel.parent?.name ? `\`${channel.parent.name}\`` : t(channel.guild?.id, 'log_none'), inline: true },
            { name: t(channel.guild?.id, 'field_id'), value: `\`${channel.id}\``, inline: true },
        ])
        .setFooter({ text: t(channel.guild?.id, 'log_channel_id_footer', { id: channel.id }) })
        .setTimestamp();

    await sendEmbed(channel.guild, embed);
}

async function onChannelDelete(channel) {
    if (!channel.guild) return;

    const embed = new EmbedBuilder()
        .setTitle(t(channel.guild?.id, 'log_title_channel_deleted'))
        .setColor(COLORS.RED)
        .addFields([
            { name: t(channel.guild?.id, 'log_field_channel_name'), value: `\`#${channel.name}\``, inline: true },
            { name: t(channel.guild?.id, 'log_field_type'), value: channelTypeName(channel.type, channel.guild?.id), inline: true },
            { name: t(channel.guild?.id, 'help_category'), value: channel.parent?.name ? `\`${channel.parent.name}\`` : t(channel.guild?.id, 'log_none'), inline: true },
            { name: t(channel.guild?.id, 'field_id'), value: `\`${channel.id}\``, inline: true },
        ])
        .setFooter({ text: t(channel.guild?.id, 'log_channel_id_footer', { id: channel.id }) })
        .setTimestamp();

    await sendEmbed(channel.guild, embed);
}

async function onChannelUpdate(oldChannel, newChannel) {
    if (!newChannel.guild) return;

    const changes = [];
    if (oldChannel.name !== newChannel.name) {
        changes.push(t(newChannel.guild?.id, 'log_change_name', { old: `\`#${oldChannel.name}\``, new: `\`#${newChannel.name}\`` }));
    }
    if (oldChannel.topic !== newChannel.topic) {
        changes.push(t(newChannel.guild?.id, 'log_change_topic', { old: `\`${oldChannel.topic || t(newChannel.guild?.id, 'log_none_plain')}\``, new: `\`${newChannel.topic || t(newChannel.guild?.id, 'log_none_plain')}\`` }));
    }
    if (oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser) {
        changes.push(t(newChannel.guild?.id, 'log_change_slowmode', { old: `\`${oldChannel.rateLimitPerUser}s\``, new: `\`${newChannel.rateLimitPerUser}s\`` }));
    }
    if (oldChannel.parentId !== newChannel.parentId) {
        const oldParent = oldChannel.parent?.name || t(newChannel.guild?.id, 'log_none_plain');
        const newParent = newChannel.parent?.name || t(newChannel.guild?.id, 'log_none_plain');
        changes.push(t(newChannel.guild?.id, 'log_change_category', { old: `\`${oldParent}\``, new: `\`${newParent}\`` }));
    }

    if (changes.length === 0) return;

    const embed = new EmbedBuilder()
        .setTitle(t(newChannel.guild?.id, 'log_title_channel_updated'))
        .setColor(COLORS.BLUE)
        .addFields([
            { name: t(newChannel.guild?.id, 'log_title_channel'), value: `${newChannel}`, inline: true },
            { name: t(newChannel.guild?.id, 'field_id'), value: `\`${newChannel.id}\``, inline: true },
            { name: t(newChannel.guild?.id, 'log_field_changes'), value: truncate(changes.join('\n'), 1024), inline: false },
        ])
        .setFooter({ text: t(newChannel.guild?.id, 'log_channel_id_footer', { id: newChannel.id }) })
        .setTimestamp();

    await sendEmbed(newChannel.guild, embed);
}

async function onGuildUpdate(oldGuild, newGuild) {
    const changes = [];
    if (oldGuild.name !== newGuild.name) {
        changes.push(t(newGuild?.id, 'log_change_server_name', { old: `\`${oldGuild.name}\``, new: `\`${newGuild.name}\`` }));
    }
    if (oldGuild.icon !== newGuild.icon) {
        changes.push(`• **${t(newGuild?.id, 'log_field_server_icon')}:** ${t(newGuild?.id, 'log_change_server_icon')}`);
    }
    if (oldGuild.premiumTier !== newGuild.premiumTier) {
        changes.push(t(newGuild?.id, 'log_change_boost_tier', { old: `\`${oldGuild.premiumTier}\``, new: `\`${newGuild.premiumTier}\`` }));
    }
    if (oldGuild.premiumSubscriptionCount !== newGuild.premiumSubscriptionCount) {
        changes.push(t(newGuild?.id, 'log_change_boost_count', { old: `\`${oldGuild.premiumSubscriptionCount}\``, new: `\`${newGuild.premiumSubscriptionCount}\`` }));
    }

    if (changes.length === 0) return;

    const embed = new EmbedBuilder()
        .setTitle(t(newGuild?.id, 'log_title_server_updated'))
        .setColor(COLORS.YELLOW)
        .addFields([
            { name: t(newGuild?.id, 'log_field_server'), value: `\`${newGuild.name}\``, inline: true },
            { name: t(newGuild?.id, 'field_id'), value: `\`${newGuild.id}\``, inline: true },
            { name: t(newGuild?.id, 'log_field_changes'), value: changes.join('\n'), inline: false },
        ])
        .setFooter({ text: t(newGuild?.id, 'log_server_id_footer', { id: newGuild.id }) })
        .setTimestamp();

    if (newGuild.iconURL()) {
        embed.setThumbnail(newGuild.iconURL({ dynamic: true, size: 256 }));
    }

    await sendEmbed(newGuild, embed);
}

module.exports = {
    COLORS,
    getLogChannel,
    sendEmbed,
    hasSendPermissions,
    onMessageDelete,
    onMessageDeleteBulk,
    onMessageUpdate,
    onGuildMemberAdd,
    onGuildMemberRemove,
    onGuildBanAdd,
    onGuildBanRemove,
    onGuildMemberUpdate,
    onVoiceStateUpdate,
    onRoleCreate,
    onRoleDelete,
    onRoleUpdate,
    onChannelCreate,
    onChannelDelete,
    onChannelUpdate,
    onGuildUpdate,
};
