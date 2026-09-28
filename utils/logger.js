const {
    AuditLogEvent,
    ChannelType,
    EmbedBuilder,
    PermissionFlagsBits,
} = require('discord.js');
const { getLogChannelId } = require('./storage');
const { envValue } = require('./foxcraft');

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

/**
 * Resolves the configured log channel for a guild.
 * Checks per-guild persistence first, then FOXCRAFT_LOG_CHANNEL_ID,
 * and falls back to a channel named '🛡️・mod-loglar' or 'mod-log'.
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
    const named = guild.channels.cache.find(c => (c.name === '🛡️・mod-loglar' || c.name === 'mod-log') && c.isTextBased());
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
            console.error('[LOGGER] Mesaj göndərilmədi:', err.message);
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

function channelTypeName(type) {
    switch (type) {
        case ChannelType.GuildText: return 'Mətn';
        case ChannelType.GuildVoice: return 'Səs';
        case ChannelType.GuildCategory: return 'Kateqoriya';
        case ChannelType.GuildAnnouncement: return 'Elan';
        case ChannelType.GuildStageVoice: return 'Stage';
        case ChannelType.GuildForum: return 'Forum';
        default: return 'Digər';
    }
}

// ==============================================================================
// LOG EVENT HANDLERS
// ==============================================================================

async function onMessageDelete(message, messageSnapshots = null) {
    if (!message.guild) return;

    // Check memory snapshot if message was partial / uncached
    const snapshot = messageSnapshots ? messageSnapshots.get(message.id) : null;
    const authorTag = snapshot?.author || message.author?.tag || 'Naməlum Müəllif';
    const authorId = message.author?.id || 'Naməlum ID';
    const authorMention = message.author ? `<@${message.author.id}>` : authorTag;
    const channelName = snapshot?.channelName || message.channel?.name || 'naməlum-kanal';
    const rawContent = snapshot?.content || message.content;
    const content = rawContent ? truncate(rawContent) : '*[Məzmun keşdə yoxdur / Boş]*';

    // Audit log check for who deleted the message
    const audit = await findAuditExecutor(message.guild, AuditLogEvent.MessageDelete, message.id);
    const executorText = audit?.executor ? `${audit.executor.tag} (\`${audit.executor.id}\`)` : 'Müəllif və ya Müəyyən edilmədi';

    const fields = [
        { name: '👤 Müəllif', value: `${authorMention} (${authorTag})`, inline: true },
        { name: '📍 Kanal', value: `${message.channel || `#${channelName}`}`, inline: true },
        { name: '🛡️ Silən', value: executorText, inline: true },
        { name: '💬 Məzmun', value: content, inline: false },
    ];

    // Attachments info if present
    if (message.attachments && message.attachments.size > 0) {
        const fileNames = message.attachments.map(a => `• \`${a.name}\``).join('\n');
        fields.push({ name: `📎 Qoşmalar (${message.attachments.size})`, value: truncate(fileNames, 1024), inline: false });
    }

    const embed = new EmbedBuilder()
        .setTitle('🗑️ Mesaj Silindi')
        .setColor(COLORS.RED)
        .addFields(fields)
        .setFooter({ text: `Mesaj ID: ${message.id} • Müəllif ID: ${authorId}` })
        .setTimestamp();

    await sendEmbed(message.guild, embed);
}

async function onMessageDeleteBulk(messages, messageSnapshots = null) {
    const first = messages.first();
    if (!first || !first.guild) return;

    const audit = await findAuditExecutor(first.guild, AuditLogEvent.MessageBulkDelete, first.channel.id);
    const executorText = audit?.executor ? `${audit.executor.tag} (\`${audit.executor.id}\`)` : 'Müəyyən edilmədi';

    const samples = messages
        .map((msg) => {
            const snapshot = messageSnapshots ? messageSnapshots.get(msg.id) : null;
            const author = snapshot?.author || msg.author?.tag || 'Naməlum';
            const text = snapshot?.content || msg.content || '[keşdə yoxdur]';
            return `**${author}:** ${truncate(text, 100)}`;
        })
        .slice(0, 5)
        .join('\n');

    const fields = [
        { name: '📍 Kanal', value: `${first.channel}`, inline: true },
        { name: '🔢 Silinən Mesaj Sayı', value: `\`${messages.size}\``, inline: true },
        { name: '🛡️ Silən Yetkili', value: executorText, inline: true },
    ];

    if (samples) {
        fields.push({ name: '📋 Son Mesajlardan Nümunələr', value: truncate(samples, 1024), inline: false });
    }

    const embed = new EmbedBuilder()
        .setTitle('🗑️ Toplu Mesaj Silindi')
        .setColor(COLORS.RED)
        .addFields(fields)
        .setFooter({ text: `Kanal ID: ${first.channel.id}` })
        .setTimestamp();

    await sendEmbed(first.guild, embed);
}

async function onMessageUpdate(oldMessage, newMessage) {
    if (!newMessage.guild || newMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return; // Ignore pin/embed updates

    const oldText = oldMessage.content ? truncate(oldMessage.content) : '*[Keşdə yox idi]*';
    const newText = newMessage.content ? truncate(newMessage.content) : '*[Məzmun boşdur]*';

    const embed = new EmbedBuilder()
        .setTitle('✏️ Mesaj Redaktə Edildi')
        .setColor(COLORS.BLUE)
        .addFields([
            { name: '👤 Müəllif', value: `${newMessage.author} (\`${newMessage.author.tag}\`)`, inline: true },
            { name: '📍 Kanal', value: `${newMessage.channel}`, inline: true },
            { name: '🔗 Keçid', value: `[Mesaja bax](${newMessage.url})`, inline: true },
            { name: '⬅️ Əvvəlki Məzmun', value: oldText, inline: false },
            { name: '➡️ Yeni Məzmun', value: newText, inline: false },
        ])
        .setFooter({ text: `Mesaj ID: ${newMessage.id} • Müəllif ID: ${newMessage.author.id}` })
        .setTimestamp();

    await sendEmbed(newMessage.guild, embed);
}

async function onGuildMemberAdd(member) {
    if (!member.guild) return;

    const createdTime = Math.floor(member.user.createdTimestamp / 1000);

    const embed = new EmbedBuilder()
        .setTitle('📥 Yeni Üzv Qoşuldu')
        .setColor(COLORS.GREEN)
        .addFields([
            { name: '👤 İstifadəçi', value: `${member.user} (\`${member.user.tag}\`)`, inline: true },
            { name: '🆔 ID', value: `\`${member.id}\``, inline: true },
            { name: '👥 Ümumi Üzv Sayı', value: `\`${member.guild.memberCount}\``, inline: true },
            { name: '📅 Hesab Yaradılıb', value: `<t:${createdTime}:F> (<t:${createdTime}:R>)`, inline: false },
        ])
        .setFooter({ text: `İstifadəçi ID: ${member.id}` })
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
        const executor = kickAudit.executor ? `${kickAudit.executor.tag} (\`${kickAudit.executor.id}\`)` : 'Müəyyən edilmədi';
        const reason = kickAudit.reason || 'Səbəb göstərilməyib';

        const embed = new EmbedBuilder()
            .setTitle('👢 Üzv Qovuldu (Kick)')
            .setColor(COLORS.RED)
            .addFields([
                { name: '👤 Qovulan Üzv', value: `${member.user?.tag || member.id} (\`${member.id}\`)`, inline: true },
                { name: '🛡️ Qovan Yetkili', value: executor, inline: true },
                { name: '📝 Səbəb', value: reason, inline: false },
            ])
            .setFooter({ text: `İstifadəçi ID: ${member.id}` })
            .setTimestamp();

        if (typeof member.user?.displayAvatarURL === 'function') {
            embed.setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }));
        }

        return sendEmbed(member.guild, embed);
    }

    // Voluntary departure
    const joinedTimestamp = member.joinedTimestamp ? Math.floor(member.joinedTimestamp / 1000) : null;
    const joinedText = joinedTimestamp ? `<t:${joinedTimestamp}:F> (<t:${joinedTimestamp}:R>)` : 'Məlum deyil';

    const embed = new EmbedBuilder()
        .setTitle('📤 Üzv Serverdən Ayrıldı')
        .setColor(COLORS.GREY)
        .addFields([
            { name: '👤 İstifadəçi', value: `${member.user?.tag || member.id} (\`${member.id}\`)`, inline: true },
            { name: '👥 Qalan Üzv Sayı', value: `\`${member.guild.memberCount}\``, inline: true },
            { name: '📅 Serverə Qoşulmuşdu', value: joinedText, inline: false },
        ])
        .setFooter({ text: `İstifadəçi ID: ${member.id}` })
        .setTimestamp();

    if (typeof member.user?.displayAvatarURL === 'function') {
        embed.setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }));
    }

    await sendEmbed(member.guild, embed);
}

async function onGuildBanAdd(ban) {
    if (!ban.guild) return;

    const audit = await findAuditExecutor(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
    const executor = audit?.executor ? `${audit.executor.tag} (\`${audit.executor.id}\`)` : 'Müəyyən edilmədi';
    const reason = ban.reason || audit?.reason || 'Səbəb göstərilməyib';

    const embed = new EmbedBuilder()
        .setTitle('🔨 Üzv Banlandı')
        .setColor(COLORS.RED)
        .addFields([
            { name: '👤 Banlanan İstifadəçi', value: `${ban.user.tag} (\`${ban.user.id}\`)`, inline: true },
            { name: '🛡️ Banlayan Yetkili', value: executor, inline: true },
            { name: '📝 Səbəb', value: reason, inline: false },
        ])
        .setFooter({ text: `İstifadəçi ID: ${ban.user.id}` })
        .setTimestamp();

    if (typeof ban.user?.displayAvatarURL === 'function') {
        embed.setThumbnail(ban.user.displayAvatarURL({ dynamic: true, size: 256 }));
    }

    await sendEmbed(ban.guild, embed);
}

async function onGuildBanRemove(ban) {
    if (!ban.guild) return;

    const audit = await findAuditExecutor(ban.guild, AuditLogEvent.MemberBanRemove, ban.user.id);
    const executor = audit?.executor ? `${audit.executor.tag} (\`${audit.executor.id}\`)` : 'Müəyyən edilmədi';

    const embed = new EmbedBuilder()
        .setTitle('🔓 Üzvün Banı Götürüldü')
        .setColor(COLORS.GREEN)
        .addFields([
            { name: '👤 İstifadəçi', value: `${ban.user.tag} (\`${ban.user.id}\`)`, inline: true },
            { name: '🛡️ Banı Götürən Yetkili', value: executor, inline: true },
        ])
        .setFooter({ text: `İstifadəçi ID: ${ban.user.id}` })
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
            .setTitle('🏷️ Ləqəb Dəyişdirildi')
            .setColor(COLORS.YELLOW)
            .addFields([
                { name: '👤 Üzv', value: `${newMember.user} (\`${newMember.user.tag}\`)`, inline: true },
                { name: '⬅️ Əvvəlki Ləqəb', value: `\`${oldNick}\``, inline: true },
                { name: '➡️ Yeni Ləqəb', value: `\`${newNick}\``, inline: true },
            ])
            .setFooter({ text: `İstifadəçi ID: ${newMember.id}` })
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
                .setTitle('➕ Üzvə Rol Verildi')
                .setColor(COLORS.BLURPLE)
                .addFields([
                    { name: '👤 Üzv', value: `${newMember.user} (\`${newMember.user.tag}\`)`, inline: true },
                    { name: '🛡️ Verilən Rol(lar)', value: truncate(addedList, 1024), inline: false },
                ])
                .setFooter({ text: `İstifadəçi ID: ${newMember.id}` })
                .setTimestamp();

            await sendEmbed(newMember.guild, embed);
        }

        if (removed.size > 0) {
            const removedList = removed.map(r => `${r}`).join(', ');
            const embed = new EmbedBuilder()
                .setTitle('➖ Üzvdən Rol Alındı')
                .setColor(COLORS.ORANGE)
                .addFields([
                    { name: '👤 Üzv', value: `${newMember.user} (\`${newMember.user.tag}\`)`, inline: true },
                    { name: '🛡️ Alınan Rol(lar)', value: truncate(removedList, 1024), inline: false },
                ])
                .setFooter({ text: `İstifadəçi ID: ${newMember.id}` })
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
            .setTitle('🔊 Səs Kanalına Qoşuldu')
            .setColor(COLORS.TEAL)
            .addFields([
                { name: '👤 Üzv', value: `${member.user} (\`${member.user.tag}\`)`, inline: true },
                { name: '📍 Kanal', value: `\`${newState.channel?.name}\``, inline: true },
            ])
            .setFooter({ text: `İstifadəçi ID: ${member.id}` })
            .setTimestamp();

        await sendEmbed(guild, embed);
        return;
    }

    // Left voice
    if (oldState.channelId && !newState.channelId) {
        const embed = new EmbedBuilder()
            .setTitle('🔇 Səs Kanalından Ayrıldı')
            .setColor(COLORS.GREY)
            .addFields([
                { name: '👤 Üzv', value: `${member.user} (\`${member.user.tag}\`)`, inline: true },
                { name: '📍 Kanal', value: `\`${oldState.channel?.name}\``, inline: true },
            ])
            .setFooter({ text: `İstifadəçi ID: ${member.id}` })
            .setTimestamp();

        await sendEmbed(guild, embed);
        return;
    }

    // Moved voice channel
    if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        const embed = new EmbedBuilder()
            .setTitle('🔀 Səs Kanalı Dəyişdirildi')
            .setColor(COLORS.BLURPLE)
            .addFields([
                { name: '👤 Üzv', value: `${member.user} (\`${member.user.tag}\`)`, inline: true },
                { name: '⬅️ Əvvəlki Kanal', value: `\`${oldState.channel?.name}\``, inline: true },
                { name: '➡️ Yeni Kanal', value: `\`${newState.channel?.name}\``, inline: true },
            ])
            .setFooter({ text: `İstifadəçi ID: ${member.id}` })
            .setTimestamp();

        await sendEmbed(guild, embed);
    }
}

async function onRoleCreate(role) {
    if (!role.guild) return;

    const hexColor = `#${role.color.toString(16).padStart(6, '0')}`;
    const embed = new EmbedBuilder()
        .setTitle('🆕 Yeni Rol Yaradıldı')
        .setColor(COLORS.GREEN)
        .addFields([
            { name: '🛡️ Rol', value: `${role} (\`${role.name}\`)`, inline: true },
            { name: '🆔 ID', value: `\`${role.id}\``, inline: true },
            { name: '🎨 Rəng', value: `\`${hexColor}\``, inline: true },
            { name: '👥 Ayrı Göstərilir (Hoist)', value: role.hoist ? '✅ Bəli' : '❌ Xeyr', inline: true },
            { name: '📢 Mention edilə bilər', value: role.mentionable ? '✅ Bəli' : '❌ Xeyr', inline: true },
        ])
        .setFooter({ text: `Rol ID: ${role.id}` })
        .setTimestamp();

    await sendEmbed(role.guild, embed);
}

async function onRoleDelete(role) {
    if (!role.guild) return;

    const embed = new EmbedBuilder()
        .setTitle('🗑️ Rol Silindi')
        .setColor(COLORS.RED)
        .addFields([
            { name: '🛡️ Rol Adı', value: `\`${role.name}\``, inline: true },
            { name: '🆔 ID', value: `\`${role.id}\``, inline: true },
        ])
        .setFooter({ text: `Rol ID: ${role.id}` })
        .setTimestamp();

    await sendEmbed(role.guild, embed);
}

async function onRoleUpdate(oldRole, newRole) {
    if (!newRole.guild) return;

    const changes = [];
    if (oldRole.name !== newRole.name) {
        changes.push(`• **Ad:** \`${oldRole.name}\` ➔ \`${newRole.name}\``);
    }
    if (oldRole.color !== newRole.color) {
        const oldHex = `#${oldRole.color.toString(16).padStart(6, '0')}`;
        const newHex = `#${newRole.color.toString(16).padStart(6, '0')}`;
        changes.push(`• **Rəng:** \`${oldHex}\` ➔ \`${newHex}\``);
    }
    if (oldRole.hoist !== newRole.hoist) {
        changes.push(`• **Ayrı Göstərilmə:** \`${oldRole.hoist}\` ➔ \`${newRole.hoist}\``);
    }
    if (oldRole.mentionable !== newRole.mentionable) {
        changes.push(`• **Mention:** \`${oldRole.mentionable}\` ➔ \`${newRole.mentionable}\``);
    }
    if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) {
        changes.push('• **İcazələr:** Rolun icazələrində dəyişiklik edildi.');
    }

    if (changes.length === 0) return;

    const embed = new EmbedBuilder()
        .setTitle('⚙️ Rol Yeniləndi')
        .setColor(COLORS.BLUE)
        .addFields([
            { name: '🛡️ Rol', value: `${newRole} (\`${newRole.name}\`)`, inline: true },
            { name: '🆔 ID', value: `\`${newRole.id}\``, inline: true },
            { name: '📝 Dəyişikliklər', value: changes.join('\n'), inline: false },
        ])
        .setFooter({ text: `Rol ID: ${newRole.id}` })
        .setTimestamp();

    await sendEmbed(newRole.guild, embed);
}

async function onChannelCreate(channel) {
    if (!channel.guild) return;

    const embed = new EmbedBuilder()
        .setTitle('📁 Kanal Yaradıldı')
        .setColor(COLORS.GREEN)
        .addFields([
            { name: '📍 Kanal', value: `${channel} (\`${channel.name}\`)`, inline: true },
            { name: '📑 Növ', value: channelTypeName(channel.type), inline: true },
            { name: '📂 Kateqoriya', value: channel.parent?.name ? `\`${channel.parent.name}\`` : '*Yoxdur*', inline: true },
            { name: '🆔 ID', value: `\`${channel.id}\``, inline: true },
        ])
        .setFooter({ text: `Kanal ID: ${channel.id}` })
        .setTimestamp();

    await sendEmbed(channel.guild, embed);
}

async function onChannelDelete(channel) {
    if (!channel.guild) return;

    const embed = new EmbedBuilder()
        .setTitle('🗑️ Kanal Silindi')
        .setColor(COLORS.RED)
        .addFields([
            { name: '📍 Kanal Adı', value: `\`#${channel.name}\``, inline: true },
            { name: '📑 Növ', value: channelTypeName(channel.type), inline: true },
            { name: '📂 Kateqoriya', value: channel.parent?.name ? `\`${channel.parent.name}\`` : '*Yoxdur*', inline: true },
            { name: '🆔 ID', value: `\`${channel.id}\``, inline: true },
        ])
        .setFooter({ text: `Kanal ID: ${channel.id}` })
        .setTimestamp();

    await sendEmbed(channel.guild, embed);
}

async function onChannelUpdate(oldChannel, newChannel) {
    if (!newChannel.guild) return;

    const changes = [];
    if (oldChannel.name !== newChannel.name) {
        changes.push(`• **Ad:** \`#${oldChannel.name}\` ➔ \`#${newChannel.name}\``);
    }
    if (oldChannel.topic !== newChannel.topic) {
        changes.push(`• **Mövzu:** \`${oldChannel.topic || 'Boş'}\` ➔ \`${newChannel.topic || 'Boş'}\``);
    }
    if (oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser) {
        changes.push(`• **Yavaş rejim (Slowmode):** \`${oldChannel.rateLimitPerUser}s\` ➔ \`${newChannel.rateLimitPerUser}s\``);
    }
    if (oldChannel.parentId !== newChannel.parentId) {
        const oldParent = oldChannel.parent?.name || 'Yoxdur';
        const newParent = newChannel.parent?.name || 'Yoxdur';
        changes.push(`• **Kateqoriya:** \`${oldParent}\` ➔ \`${newParent}\``);
    }

    if (changes.length === 0) return;

    const embed = new EmbedBuilder()
        .setTitle('⚙️ Kanal Yeniləndi')
        .setColor(COLORS.BLUE)
        .addFields([
            { name: '📍 Kanal', value: `${newChannel}`, inline: true },
            { name: '🆔 ID', value: `\`${newChannel.id}\``, inline: true },
            { name: '📝 Dəyişikliklər', value: truncate(changes.join('\n'), 1024), inline: false },
        ])
        .setFooter({ text: `Kanal ID: ${newChannel.id}` })
        .setTimestamp();

    await sendEmbed(newChannel.guild, embed);
}

async function onGuildUpdate(oldGuild, newGuild) {
    const changes = [];
    if (oldGuild.name !== newGuild.name) {
        changes.push(`• **Server Adı:** \`${oldGuild.name}\` ➔ \`${newGuild.name}\``);
    }
    if (oldGuild.icon !== newGuild.icon) {
        changes.push('• **Server İkonu:** Dəyişdirildi');
    }
    if (oldGuild.premiumTier !== newGuild.premiumTier) {
        changes.push(`• **Boost Səviyyəsi (Tier):** \`${oldGuild.premiumTier}\` ➔ \`${newGuild.premiumTier}\``);
    }
    if (oldGuild.premiumSubscriptionCount !== newGuild.premiumSubscriptionCount) {
        changes.push(`• **Boost Sayı:** \`${oldGuild.premiumSubscriptionCount}\` ➔ \`${newGuild.premiumSubscriptionCount}\``);
    }

    if (changes.length === 0) return;

    const embed = new EmbedBuilder()
        .setTitle('🏰 Server Məlumatları Yeniləndi')
        .setColor(COLORS.YELLOW)
        .addFields([
            { name: '🏰 Server', value: `\`${newGuild.name}\``, inline: true },
            { name: '🆔 ID', value: `\`${newGuild.id}\``, inline: true },
            { name: '📝 Dəyişikliklər', value: changes.join('\n'), inline: false },
        ])
        .setFooter({ text: `Server ID: ${newGuild.id}` })
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
