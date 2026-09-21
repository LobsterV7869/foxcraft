/**
 * FoxCraft - Azərbaycan Minecraft Discord tətbiqi
 * 
 * ==============================================================================
 * ARCHITECTURE OVERVIEW: USER-INSTALLED APPS & HTTP WEBHOOK INTERACTIONS
 * ==============================================================================
 * Unlike traditional Discord bots that connect to a persistent WebSocket gateway,
 * User-Installed Apps operate via incoming HTTP webhooks:
 * 
 * 1. NO BOT PRESENCE / NO GATEWAY:
 *    There is no active WebSocket client (`client.login()`). The app is purely
 *    an Express HTTP server listening for interaction webhooks from Discord.
 * 
 * 2. USER INSTALLATION (integration_types: [1]):
 *    Users install this app to their personal Discord account ("Add App to Profile"),
 *    granting the `applications.commands` OAuth2 scope.
 * 
 * 3. USABLE ANYWHERE (contexts: [0, 1, 2]):
 *    Once installed by a user, the app's slash commands can be used across:
 *      - Context 0: Any Discord server the user is in (Guilds)
 *      - Context 1: Direct Messages with the app (Bot DMs)
 *      - Context 2: Private group chats (Group DMs)
 * 
 * 4. CRYPTOGRAPHIC SIGNATURE VERIFICATION:
 *    Every incoming HTTP request from Discord includes `X-Signature-Ed25519` and
 *    `X-Signature-Timestamp` headers. The `discord-interactions` middleware verifies
 *    these headers against your Discord application's PUBLIC_KEY to ensure the request
 *    genuinely originated from Discord.
 * 
 * 5. SINGLE-RESPONSE CYCLE & RATE LIMITING:
 *    Each invocation produces exactly one response back over the open HTTP connection
 *    (within Discord's 3.0-second deadline). To prevent abuse, requests are limited
 *    to 1 command per 3 seconds per user.
 * ==============================================================================
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const {
    ActionRowBuilder,
    ActivityType,
    AttachmentBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    Client,
    GatewayIntentBits,
    ModalBuilder,
    Partials,
    PermissionsBitField,
    TextInputBuilder,
    TextInputStyle,
    AuditLogEvent,
    StringSelectMenuBuilder,
} = require('discord.js');
const { getGuildConfig } = require('./utils/config');
const {
    envValue,
    fetchMinecraftStatus,
    foxcraftEmbed,
    formatMinecraftStatus,
    getServerValues,
} = require('./utils/foxcraft');
const { getGameState, setGameState } = require('./utils/storage');
const { connectDB } = require('./utils/storage');

const {
    verifyKeyMiddleware,
    InteractionType,
    InteractionResponseType,
    InteractionResponseFlags
} = require('discord-interactions');

const app = express();
const PORT = process.env.PORT || 3000;
const publicKey = process.env.PUBLIC_KEY ? process.env.PUBLIC_KEY.trim() : null;
const prefix = envValue('PREFIX', '!');

// ==============================================================================
// 1. INITIALIZATION CHECKS
// ==============================================================================
const hasValidPublicKey = publicKey && publicKey !== 'your_application_public_key_here';

if (!hasValidPublicKey) {
    console.error('❌ CRITICAL ERROR: PUBLIC_KEY is missing in your .env file!');
    console.error('👉 Discord Developer Portal -> FoxCraft tətbiqi -> General Information -> PUBLIC KEY bölməsindən götürün.');
    console.error('👉 Add it to your .env file: PUBLIC_KEY=your_key_here');
}

async function findDeleteExecutor(guild, messageId, bulk = false) {
    try {
        const logs = await guild.fetchAuditLogs({
            type: bulk ? AuditLogEvent.MessageBulkDelete : AuditLogEvent.MessageDelete,
            limit: 10,
        });
        const entry = logs.entries.find((item) => {
            const age = Date.now() - item.createdTimestamp;
            if (age > 15_000) return false;
            if (bulk) return item.extra?.channel?.id === messageId?.channelId;
            return item.target?.id === messageId;
        });
        return entry?.executor || null;
    } catch (error) {
        console.error('[FOXCRAFT LOG] Audit silinmə qeydi alınmadı:', {
            message: error.message,
            code: error.code ?? null,
            status: error.status ?? error.httpStatus ?? null,
        });
        return null;
    }
}

// ==============================================================================
// 2. DYNAMIC COMMAND LOADER
// ==============================================================================
const commands = new Map();
const commandsPath = path.join(__dirname, 'commands');

if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            commands.set(command.data.name, command);
            console.log(`📦 Loaded slash command: /${command.data.name}`);
        } else {
            console.warn(`⚠️ Skipped invalid command file: ${file}`);
        }

    }
} else {
    console.warn('⚠️ No ./commands directory found.');
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel],
});

client.once('ready', () => {
    client.user.setPresence({
        activities: [{ name: 'FoxCraft | Minecraft', type: ActivityType.Playing }],
        status: 'online',
    });
    console.log(`[FOXCRAFT] Gateway hazırdır: ${client.user.tag} (Application ID: ${client.application?.id || client.user.id})`);
    console.log('[FOXCRAFT] Mesaj oyunları üçün Message Content Intent tələb olunur; Developer Portal-da aktiv olmalıdır.');
    updateStatusChannel();
    setInterval(updateStatusChannel, 5 * 60 * 1000).unref();
});

async function updateStatusChannel() {
    const channelId = envValue('FOXCRAFT_STATUS_CHANNEL_ID');
    if (!channelId || !client.isReady()) return;
    const { ip } = getServerValues();
    if (ip === 'Yaxında') return;
    try {
        const status = await fetchMinecraftStatus(ip);
        const result = formatMinecraftStatus(status, getServerValues().version);
        const channel = await client.channels.fetch(channelId);
        if (!channel || typeof channel.setName !== 'function') {
            console.error('[FOXCRAFT] Status kanalı adını dəyişmək mümkün deyil: kanal tapılmadı və ya uyğun tip deyil.');
            return;
        }
        const label = status?.online
            ? `Online: ${status.players?.online ?? 0}/${status.players?.max ?? '?'}`
            : 'Offline';
        await channel.setName(label.slice(0, 100), 'FoxCraft canlı server statusu');
        console.log(`[FOXCRAFT] Status kanalı yeniləndi: ${result.description}`);
    } catch (error) {
        console.error('[FOXCRAFT] Status kanalı yenilənmədi:', error.message);
    }
}

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(prefix)) return;
    const content = message.content.slice(prefix.length).trim();
    const [name, ...args] = content.split(/\s+/);

    // Handle !profile <username>
    if (name?.toLowerCase() === 'profile') {
        const targetUser = args[0];
        if (!targetUser) return message.reply('❌ Zəhmət olmasa istifadəçi adını daxil edin: `!profile <username>`');

        try {
            // Try to find the user in the guild by mention or name
            const member = message.guild.members.cache.find(m => m.user.username.toLowerCase() === targetUser.toLowerCase() || m.user.id === targetUser);
            if (!member) return message.reply('❌ İstifadəçi tapılmadı.');

            const embed = {
                ...foxcraftEmbed('👤 İstifadəçi Profili', `**${member.user.username}** istifadəçisinin məlumatları`),
                thumbnail: { url: member.user.displayAvatarURL({ dynamic: true, size: 512 }) },
                fields: [
                    { name: '🆔 ID', value: `\`${member.id}\``, inline: true },
                    { name: '📅 Qoşulma Tarixi', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true },
                ],
            };
            return message.reply({ embeds: [embed] });
        } catch (error) {
            console.error('[FOXCRAFT] Profile xətası:', error);
            return message.reply('❌ Profil məlumatları alınarkən xəta baş verdi.');
        }
    }

    const command = commands.get(name?.toLowerCase());
    if (!command?.prefixExecute) return;
    try {
        await command.prefixExecute(message, args);
    } catch (error) {
        console.error(`[FOXCRAFT] !${name} əmri uğursuz oldu:`, error);
        await message.reply('Əmr icra edilərkən xəta baş verdi.').catch(() => {});
    }
});

client.on('guildMemberAdd', async (member) => {
    console.log(`[FOXCRAFT] Yeni üzv hadisəsi alındı: ${member.user.tag} (${member.guild.name})`);
    try {
        const channels = await member.guild.channels.fetch();
        const lobby = channels.find((channel) =>
            channel?.name?.normalize('NFC').endsWith('lobi') &&
            channel.isTextBased()
        );
        if (!lobby) {
            console.error('[FOXCRAFT] Xoş gəldin lobi kanalı tapılmadı. Gözlənilən ad: 👋・lobi');
        } else {
            await lobby.send({
                content: `Salam ${member}, FoxCraft serverinə xoş gəldin!`,
                allowedMentions: { users: [member.id] },
            });
            console.log(`[FOXCRAFT] Xoş gəldin mesajı göndərildi: #${lobby.name}`);
        }
    } catch (error) {
        console.error('[FOXCRAFT] Lobi xoş gəldin mesajı göndərilmədi:', {
            message: error.message,
            code: error.code ?? null,
            status: error.status ?? error.httpStatus ?? null,
            channel: '👋・lobi',
        });
    }
    await auditLog(member.guild, 'Üzv qoşuldu', `${member.user.tag} serverə qoşuldu.`);
});

client.on('messageCreate', async (message) => {
    if (!message.guild || message.author.bot) return;
    if (channelNameIs(message.channel, 'sayı-sayma') || channelNameIs(message.channel, 'söz-oyunu')) {
        console.log(`[FOXCRAFT] Oyun mesajı alındı: kanal=${message.channel.name}, məzmun=${JSON.stringify(message.content)}`);
    }
    messageSnapshots.set(message.id, {
        author: message.author.tag,
        content: message.content.slice(0, 1500) || '[mətn yoxdur]',
        channelId: message.channel.id,
        channelName: message.channel.name,
        createdAt: message.createdAt,
    });
    if (messageSnapshots.size > 5000) {
        messageSnapshots.delete(messageSnapshots.keys().next().value);
    }
    if (await handleCounting(message) || await handleWordGame(message)) return;
    await handleSuggestionReactions(message);

    const now = Date.now();
    const recent = recentMessages.get(message.author.id) || [];
    recent.push(now);
    recentMessages.set(message.author.id, recent.filter((timestamp) => now - timestamp < 5000));
    if (recentMessages.get(message.author.id).length >= 6) {
        await auditLog(message.guild, 'Mümkün spam hücumu', `${message.author.tag} 5 saniyə ərzində çoxlu mesaj göndərdi.`, true);
        recentMessages.set(message.author.id, []);
    }
});

client.on('messageDelete', async (message) => {
    if (message.guild && !message.author?.bot) {
        const snapshot = messageSnapshots.get(message.id);
        const executor = await findDeleteExecutor(message.guild, message.id);
        const deletedBy = executor ? executor.tag : 'Müəyyən edilmədi (mesaj müəllifi ola bilər)';
        const createdAt = snapshot?.createdAt || message.createdAt;
        await auditLog(
            message.guild,
            'Mesaj silindi',
            [
                `Müəllif: ${snapshot?.author || message.author?.tag || 'Naməlum'}`,
                `Silən: ${deletedBy}`,
                `Kanal: #${snapshot?.channelName || message.channel?.name || 'naməlum'}`,
                `Vaxt: <t:${Math.floor(Date.now() / 1000)}:F>`,
                `Mesaj tarixi: ${createdAt ? `<t:${Math.floor(new Date(createdAt).getTime() / 1000)}:F>` : 'Yaxında'}`,
                `Məzmun: ${snapshot?.content || message.content || '[keşdə yoxdur]'}`,
            ].join('\n'),
        );
        messageSnapshots.delete(message.id);
    }
});

client.on('messageDeleteBulk', async (messages) => {
    const first = messages.first();
    if (!first?.guild) return;
    const executor = await findDeleteExecutor(first.guild, { channelId: first.channel.id }, true);
    const samples = messages.map((message) => {
        const snapshot = messageSnapshots.get(message.id);
        return `${snapshot?.author || message.author?.tag || 'Naməlum'}: ${snapshot?.content || '[keşdə yoxdur]'}`;
    }).slice(0, 10).join('\n');
    await auditLog(first.guild, 'Mesajlar toplu silindi', [
        `Say: ${messages.size}`,
        `Silən: ${executor?.tag || 'Müəyyən edilmədi'}`,
        `Kanal: #${first.channel.name}`,
        `Vaxt: <t:${Math.floor(Date.now() / 1000)}:F>`,
        `İlk mesajlar:\n${samples}`,
    ].join('\n'), true);
    for (const message of messages.values()) messageSnapshots.delete(message.id);
});

client.on('messageUpdate', async (oldMessage, newMessage) => {
    if (newMessage.guild && !newMessage.author?.bot && oldMessage.content !== newMessage.content) {
        await auditLog(newMessage.guild, 'Mesaj redaktə edildi', `${newMessage.author?.tag || 'Naməlum üzv'} tərəfindən ${newMessage.channel} kanalında mesaj redaktə edildi.`);
    }
});

client.on('guildMemberRemove', async (member) => {
    await auditLog(member.guild, 'Üzv ayrıldı', `${member.user.tag} serverdən ayrıldı.`);
});

client.on('guildBanAdd', async (ban) => {
    await auditLog(ban.guild, 'Üzv banlandı', `${ban.user.tag} serverdə banlandı.`, true);
});

client.on('guildBanRemove', async (ban) => {
    await auditLog(ban.guild, 'Ban götürüldü', `${ban.user.tag} üçün ban götürüldü.`);
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
    if (oldMember.nickname !== newMember.nickname) {
        await auditLog(newMember.guild, 'Ləqəb dəyişdirildi', `${newMember.user.tag} ləqəbini dəyişdirdi.`);
    }
    if (oldMember.roles.cache.size !== newMember.roles.cache.size) {
        await auditLog(newMember.guild, 'Üzv rolu dəyişdirildi', `${newMember.user.tag} rollarını dəyişdirdi.`);
    }
});

client.on('voiceStateUpdate', async (oldState, newState) => {
    const trigger = newState.guild.channels.cache.find(
        (channel) => channel.name === '➕・Xüsusi otaq yarat' && channel.type === 2
    );
    if (trigger && newState.channelId === trigger.id && newState.member && !newState.member.user.bot) {
        try {
            const room = await newState.guild.channels.create({
                name: `🔒・${newState.member.displayName.slice(0, 24)}`,
                type: 2,
                parent: trigger.parentId,
                permissionOverwrites: [
                    { id: newState.guild.id, deny: ['ViewChannel', 'Connect'] },
                    { id: newState.member.id, allow: ['ViewChannel', 'Connect', 'Speak', 'Stream'] },
                ],
                reason: 'FoxCraft xüsusi səs otağı',
            });
            await newState.setChannel(room);
            await auditLog(newState.guild, 'Xüsusi səs otağı yaradıldı', `${newState.member.user.tag} üçün ${room} yaradıldı.`);
        } catch (error) {
            console.error('[FOXCRAFT LOG] Xüsusi səs otağı yaradıla bilmədi:', {
                message: error.message,
                code: error.code ?? null,
                status: error.status ?? error.httpStatus ?? null,
            });
        }
    }
    if (oldState.channelId && oldState.channelId !== trigger?.id) {
        const oldChannel = oldState.guild.channels.cache.get(oldState.channelId);
        if (oldChannel?.parent?.name === '🔒・Xüsusi otaqlar' && oldChannel.name.startsWith('🔒・') && oldChannel.members.size === 0) {
            await oldChannel.delete('FoxCraft xüsusi səs otağı boş qaldı').catch((error) => {
                console.error('[FOXCRAFT LOG] Boş xüsusi səs otağı silinmədi:', error.message);
            });
        }
    }
});

client.on('roleCreate', async (role) => {
    await auditLog(role.guild, 'Rol yaradıldı', `${role.name} rolu yaradıldı.`);
});

client.on('roleDelete', async (role) => {
    await auditLog(role.guild, 'Rol silindi', `${role.name} rolu silindi.`, true);
});

client.on('roleUpdate', async (oldRole, newRole) => {
    if (oldRole.name !== newRole.name || oldRole.permissions.bitfield !== newRole.permissions.bitfield) {
        await auditLog(newRole.guild, 'Rol dəyişdirildi', `${oldRole.name} rolu yeniləndi.`);
    }
});

client.on('channelCreate', async (channel) => {
    if (channel.guild) await auditLog(channel.guild, 'Kanal yaradıldı', `${channel.name} kanalı yaradıldı.`);
});

client.on('channelDelete', async (channel) => {
    if (channel.guild) await auditLog(channel.guild, 'Kanal silindi', `${channel.name} kanalı silindi.`, true);
});

if (process.env.DISCORD_TOKEN && !process.env.VERCEL) {
    client.login(process.env.DISCORD_TOKEN).catch((error) => {
        console.error('[FOXCRAFT] Gateway giriş xətası:', error.message);
    });
}

// ==============================================================================
// 3. PER-USER RATE LIMITER (1 command per 3 seconds)
// ==============================================================================
const userCooldowns = new Map();
const RATE_LIMIT_MS = 3000;
const recentMessages = new Map();
const messageSnapshots = new Map();

async function getLogChannel(guild) {
    const configuredId = envValue('FOXCRAFT_LOG_CHANNEL_ID');
    if (configuredId) return guild.channels.cache.get(configuredId) || guild.channels.fetch(configuredId).catch(() => null);
    return guild.channels.cache.find((channel) => channel.name === '🛡️・mod-loglar');
}

async function auditLog(guild, title, description, critical = false) {
    const channel = await getLogChannel(guild);
    if (!channel?.isTextBased()) return;
    const staffRoles = guild.roles.cache.filter((role) => ['Sahibi', 'Admin'].includes(role.name));
    const mentions = critical ? [...staffRoles.values()].map((role) => `<@&${role.id}>`).join(' ') : '';
    await channel.send({
        content: mentions || undefined,
        embeds: [foxcraftEmbed(title, description)],
        allowedMentions: { roles: critical ? [...staffRoles.keys()] : [] },
    }).catch((error) => console.error('[FOXCRAFT LOG] Audit mesajı göndərilmədi:', error.message));
}

function getCheckEmoji(guild) {
    return guild.emojis.cache.find((emoji) => emoji.name === 'foxcraft_check') || '✅';
}

async function addCheckReaction(message) {
    try {
        let emoji = getCheckEmoji(message.guild);
        if (emoji === '✅') {
            const emojis = await message.guild.emojis.fetch();
            emoji = emojis.find((item) => item.name === 'foxcraft_check') || '✅';
        }
        await message.react(emoji);
    } catch (error) {
        console.error('[FOXCRAFT LOG] Düzgün cavaba emoji əlavə edilmədi:', {
            message: error.message,
            code: error.code ?? null,
            status: error.status ?? error.httpStatus ?? null,
        });
    }

}

function logMessageDeleteFailure(label, error) {
    if (error.code === 10008 || error.status === 404) return;
    console.error(`[FOXCRAFT LOG] ${label}:`, {
        message: error.message,
        code: error.code ?? null,
        status: error.status ?? error.httpStatus ?? null,
    });
}

function channelNameIs(channel, expected) {
    return channel?.name?.normalize('NFC').endsWith(expected);
}

async function handleCounting(message) {
    if (!channelNameIs(message.channel, 'sayı-sayma') || message.author.bot || message.content.startsWith(prefix)) return false;
    const state = getGameState(message.guild.id, message.channel.id, 'counting', {
        expected: 1,
        lastUser: null,
        counts: {},
        day: new Date().toISOString().slice(0, 10),
    });
    const today = new Date().toISOString().slice(0, 10);
    if (state.day !== today) {
        const report = Object.entries(state.counts).map(([userId, count]) => `<@${userId}>: ${count}`).join('\n') || 'Bu gün heç kim saymayıb.';
        const reportChannel = message.guild.channels.cache.find((channel) => channel.name === '📊・anketlər');
        if (reportChannel) await reportChannel.send({ embeds: [foxcraftEmbed('Gündəlik sayma hesabatı', report)] });
        state.expected = 1;
        state.lastUser = null;
        state.counts = {};
        state.day = today;
    }
    const number = Number(message.content.trim());
    const valid = Number.isInteger(number) && number === state.expected && message.author.id !== state.lastUser;
    if (!valid) {
        await message.delete().catch((error) => logMessageDeleteFailure('Sayma mesajı silinmədi', error));
        await message.channel.send('Növbəti düzgün rəqəm yazılmalıdır və eyni üzv ardıcıl yaza bilməz.')
            .then((warning) => setTimeout(() => warning.delete().catch(() => {}), 4000))
            .catch(() => {});
        return true;
    }

    state.expected += 1;
    state.lastUser = message.author.id;
    state.counts[message.author.id] = (state.counts[message.author.id] || 0) + 1;
    setGameState(message.guild.id, message.channel.id, 'counting', state);
    await addCheckReaction(message);
    return true;
}

async function handleSuggestionReactions(message) {
    if (!channelNameIs(message.channel, 'təklif-istək') || message.author.bot) return;
    try {
        await message.react('✅');
        await message.react('❌');
    } catch (error) {
        console.error('[FOXCRAFT LOG] Təklif reaksiyaları əlavə edilmədi:', {
            message: error.message,
            code: error.code ?? null,
            status: error.status ?? error.httpStatus ?? null,
        });
    }
}

async function handleWordGame(message) {
    if (!channelNameIs(message.channel, 'söz-oyunu') || message.author.bot || message.content.startsWith(prefix)) return false;
    const word = message.content.trim().toLocaleLowerCase('az-AZ').split(/\s+/)[0];
    const state = getGameState(message.guild.id, message.channel.id, 'word-game', {
        lastWord: null,
        used: [],
        lastUser: null,
    });
    const firstLetter = state.lastWord ? [...state.lastWord].at(-1) : null;
    const valid = /^[a-zəğıöüçş]+$/i.test(word) &&
        (!firstLetter || word.startsWith(firstLetter)) &&
        !state.used.includes(word) &&
        message.author.id !== state.lastUser;
    if (!valid) {
        await message.delete().catch((error) => logMessageDeleteFailure('Söz oyunu mesajı silinmədi', error));
        return true;
    }
    state.lastWord = word;
    state.used.push(word);
    state.lastUser = message.author.id;
    setGameState(message.guild.id, message.channel.id, 'word-game', state);
    await addCheckReaction(message);
    return true;
}

const TICKET_LOG_CHANNEL_ID = '1551244317945897070';

async function generateTranscript(channel) {
    try {
        const messages = await channel.messages.fetch({ limit: 100 });
        let transcript = `==========================================================\n`;
        transcript += `🎫 FOXCRAFT TICKET TRANSCRIPT\n`;
        transcript += `Channel: #${channel.name}\n`;
        transcript += `Date: ${new Date().toLocaleString('az-AZ')}\n`;
        transcript += `==========================================================\n\n`;

        const sorted = [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
        for (const msg of sorted) {
            const time = msg.createdAt.toLocaleString('az-AZ', { hour: '2-digit', minute: '2-digit' });
            const author = msg.author.tag;
            const content = msg.content || (msg.attachments.size > 0 ? '[Fayl göndərildi]' : '[Boş mesaj]');

            transcript += `[${time}] ${author}: ${content}\n`;
            if (msg.attachments.size > 0) {
                msg.attachments.forEach(a => transcript += `   📎 Fayl: ${a.url}\n`);
            }
            transcript += '----------------------------------------------------------\n';
        }
        transcript += `\n==========================================================\n`;
        transcript += `End of Transcript\n`;
        transcript += `==========================================================`;

        return new AttachmentBuilder(Buffer.from(transcript), { name: `transcript-${channel.name}.txt` });
    } catch (error) {
        console.error('[FOXCRAFT LOG] Transkript yaradıla bilmədi:', error);
        return null;
    }
}

async function handleButton(interaction) {
    if (!interaction.isButton()) return false;
    if (interaction.customId === 'foxcraft:ticket') {
        let category = interaction.guild.channels.cache.find((channel) =>
            (channel.name === 'Tickets' || channel.name === '🎫・dəstək' || channel.name === 'destek') && channel.type === ChannelType.GuildCategory
        );
        if (!category) {
            const supportChannel = interaction.guild.channels.cache.find(c => (c.name === '🎫・dəstək' || c.name === 'destek') && c.isTextBased());
            if (supportChannel && supportChannel.parentId) {
                category = interaction.guild.channels.cache.get(supportChannel.parentId);
            }
        }
        if (!category) {
            console.log('[FOXCRAFT] No suitable category found, using guild root.');
        }
        const safeName = interaction.user.username.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 20);
        const channel = await interaction.guild.channels.create({
            name: `ticket-${safeName}`,
            type: ChannelType.GuildText,
            parent: category?.id,
            permissionOverwrites: [
                { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
            ],
            reason: 'FoxCraft ticket yaradıldı',
        });
        await channel.send({
            embeds: [{
                ...foxcraftEmbed('🎫 AzeSpace Dəstək', `Salam ${interaction.user}. Problemini ətraflı izah et, tezliklə cavab verəcəyik.`),
                fields: [
                    { name: 'Açan', value: `${interaction.user}`, inline: true },
                    { name: 'Status', value: '🟢 Açıq', inline: true },
                ],
            }],
            components: [new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('foxcraft:ticket-claim').setLabel('🤝 Öz üzərinə götür').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('foxcraft:ticket-close').setLabel('Ticketi bağla').setStyle(ButtonStyle.Danger)
            )],
        });
        await auditLog(interaction.guild, 'Ticket yaradıldı', `${interaction.user} tərəfindən ${channel} yaradıldı.`);
        await interaction.reply({ content: `Ticket yaradıldı: ${channel}`, ephemeral: true });
        return true;
    }
    if (interaction.customId === 'foxcraft:ticket-close') {
        await interaction.reply({ content: 'Ticket bağlanır və transkript hazırlanır...', ephemeral: true });
        const transcript = await generateTranscript(interaction.channel);
        const logChannel = await interaction.guild.channels.fetch(TICKET_LOG_CHANNEL_ID).catch(() => null);
        if (logChannel && transcript) {
            await logChannel.send({
                embeds: [foxcraftEmbed('Ticket Bağlandı', `Kanal: #${interaction.channel.name}\nBağlayan: ${interaction.user}`)],
                files: [transcript]
            });
        }
        await interaction.channel.send({ content: 'Bu ticket 5 saniyə ərzində silinəcək.' });
        setTimeout(() => interaction.channel.delete('FoxCraft ticket bağlandı').catch((error) => {
            console.error('[FOXCRAFT LOG] Ticket silinmədi:', error.message);
        }), 5000);
        return true;
    }
    if (interaction.customId === 'foxcraft:ticket-claim') {
        await interaction.channel.send({
            embeds: [foxcraftEmbed('Ticket qəbul edildi', `${interaction.user} bu ticketlə məşğul olur.`)],
        });
        await auditLog(interaction.guild, 'Ticket qəbul edildi', `${interaction.user} ${interaction.channel} ticketini üzərinə götürdü.`);
        await interaction.reply({ content: 'Ticketi üzərinə götürdün.', ephemeral: true });
        return true;
    }
    return false;
}

client.on('interactionCreate', async (interaction) => {
    try {
        if (interaction.isCommand()) {
            const command = commands.get(interaction.commandName);
            if (!command) return;
            interaction.guildConfig = getGuildConfig(interaction.guildId);
            interaction.discordClient = client;
            await command.execute(interaction);
            return;
        }

        if (interaction.isButton() && interaction.customId === 'foxcraft:confession') {
            console.log(`[FOXCRAFT] Etiraf düyməsi basıldı: ${interaction.user.tag}`);
            const modal = new ModalBuilder()
                .setCustomId('foxcraft:confession-modal')
                .setTitle('Anonim etiraf')
                .addComponents(new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('text')
                        .setLabel('Etirafın')
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(true)
                        .setMaxLength(1000)
                ));
            await interaction.showModal(modal);
            return;
        }
        if (await handleButton(interaction)) return;
        if (!interaction.isModalSubmit() || interaction.customId !== 'foxcraft:confession-modal') return;
        console.log(`[FOXCRAFT] Etiraf modalı göndərildi: ${interaction.user.tag}`);
        await interaction.deferReply({ ephemeral: true });
        const channels = await interaction.guild.channels.fetch();
        const channel = channels.find((item) => item?.name === '🤫・etiraf' && item.isTextBased());
        if (!channel) throw new Error('🤫・etiraf kanalı tapılmadı');
        const content = interaction.fields.getTextInputValue('text').trim();
        if (!content) throw new Error('Etiraf mətni boşdur');
        await channel.send({ embeds: [foxcraftEmbed('Anonim etiraf', content)] });
        await auditLog(interaction.guild, 'Anonim etiraf göndərildi', `${interaction.user.tag} anonim etiraf panelindən istifadə etdi.`);
        await interaction.editReply({ content: 'Etirafın anonim şəkildə göndərildi.' });
    } catch (error) {
        console.error('[FOXCRAFT LOG] Etiraf əməliyyatı uğursuz oldu:', {
            message: error.message,
            code: error.code ?? null,
            status: error.status ?? error.httpStatus ?? null,
            method: error.method ?? null,
            url: error.url ?? null,
        });
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: 'Etiraf göndərilmədi. Problem konsolda qeyd edildi.' }).catch(() => {});
        } else {
            await interaction.reply({ content: 'Əməliyyat zamanı xəta baş verdi.', ephemeral: true }).catch(() => {});
        }
    }
});

function isRateLimited(userId) {
    if (!userId) return false;
    const now = Date.now();
    const lastTime = userCooldowns.get(userId);
    if (lastTime && (now - lastTime) < RATE_LIMIT_MS) {
        return true;
    }
    userCooldowns.set(userId, now);
    return false;
}

// Periodic cleanup of stale cooldowns to avoid memory leaks
setInterval(() => {
    const now = Date.now();
    for (const [userId, timestamp] of userCooldowns.entries()) {
        if (now - timestamp > RATE_LIMIT_MS * 2) {
            userCooldowns.delete(userId);
        }
    }
}, 5 * 60 * 1000).unref();

// ==============================================================================
// 4. HTTP ROUTES
// ==============================================================================

// Health Check & Status Page
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        app: 'FoxCraft Discord tətbiqi',
        commandsLoaded: commands.size,
        interactionsEndpoint: '/interactions'
    });
});

/**
 * Main Discord Interactions Endpoint
 * 
 * IMPORTANT: verifyKeyMiddleware consumes the raw request body stream to compute
 * the Ed25519 signature. Do NOT place express.json() or other body parsers before
 * this route!
 */
app.post('/interactions', verifyKeyMiddleware(publicKey), async (req, res) => {
    const interaction = req.body;

    // STEP A: Discord Endpoint Verification (PING)
    // When configuring your Interactions Endpoint URL in Developer Portal,
    // Discord sends a PING interaction. You MUST respond with PONG.
    if (interaction.type === InteractionType.PING) {
        return res.json({ type: InteractionResponseType.PONG });
    }

    // Component interactions are delivered here when an Interactions Endpoint
    // is configured; the gateway listener is not guaranteed to receive them.
    if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
        const customId = interaction.data?.custom_id;

        if (customId === 'foxcraft:ticket-claim') {
            const guild = await client.guilds.fetch(interaction.guild_id);
            const channel = await guild.channels.fetch(interaction.channel_id);
            const user = interaction.member?.user || interaction.user;

            // Update the header embed
            const messages = await channel.messages.fetch({ limit: 10 });
            const headerMessage = messages.find(m => m.embeds.length > 0 && m.components.length > 0);

            if (headerMessage) {
                const embed = headerMessage.embeds[0];
                const finalFields = [
                    { name: '👤 Açan', value: embed.fields?.[1]?.value || 'Naməlum', inline: true },
                    { name: '🛠️ Öhdəsinə götürən', value: `${user}`, inline: true },
                ];

                await headerMessage.edit({ embeds: [{ ...embed, fields: finalFields }] });
            }

            await auditLog(guild, 'Ticket qəbul edildi', `${user} ${channel} ticketini üzərinə götürdü.`);
            return res.json({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: { content: `Ticketi üzərinə götürdün, ${user}!`, flags: InteractionResponseFlags.EPHEMERAL }
            });
        }

        if (customId === 'foxcraft:ticket-close') {
            const guild = await client.guilds.fetch(interaction.guild_id);
            const channel = await guild.channels.fetch(interaction.channel_id);
            const user = interaction.member?.user || interaction.user;

            // 1. Generate Transcript
            const transcript = await generateTranscript(channel);
            const logChannel = await getLogChannel(guild);

            if (logChannel && transcript) {
                await logChannel.send({
                    content: `🎫 **Ticket Bağlandı**\nKanal: #${channel.name}\nBağlayan: ${user}`,
                    files: [transcript]
                });
            }

            // 2. Notify in channel
            await channel.send({ content: 'Bu ticket 5 saniyə ərzində silinəcək.' });

            // 3. Delete channel after delay
            setTimeout(() => channel.delete('FoxCraft ticket bağlandı').catch(() => {}), 5000);

            return res.json({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: { content: 'Ticket bağlanır və transkript göndərilir...', flags: InteractionResponseFlags.EPHEMERAL }
            });
        }

        if (customId === 'foxcraft:ticket-create') {
            console.log(`[FOXCRAFT] Ticket yarat düyməsi HTTP endpoint-ə çatdı: ${interaction.member?.user?.username || interaction.user?.username || 'naməlum'}`);

            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('foxcraft:ticket-category')
                    .setPlaceholder('Dəstək kateqoriyasını seçin')
                    .addOptions([
                        {
                            label: 'Alış-veriş',
                            value: 'shopping',
                            emoji: '🛒',
                            description: 'Alış-veriş və ödənişlərlə bağlı dəstək'
                        },
                        {
                            label: 'Minecraft Problemləri',
                            value: 'mc_problems',
                            emoji: '🛠️',
                            description: 'Texniki problemlər və xətalar'
                        },
                        {
                            label: 'Şikayət/İrad',
                            value: 'complaints',
                            emoji: '⚠️',
                            description: 'Şikayətlər və təkliflər'
                        },
                        {
                            label: 'Əməkdaşlıq',
                            value: 'partnership',
                            emoji: '🤝',
                            description: 'Reklam və tərəfdaşlıq təklifləri'
                        },
                    ])
            );

            return res.json({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: 'Zəhmət olmasa, kömək istədiyiniz kateqoriyanı seçin:',
                    components: [row.toJSON()],
                    flags: InteractionResponseFlags.EPHEMERAL
                }
            });
        }

        if (customId === 'foxcraft:confession') {
            console.log(`[FOXCRAFT] Etiraf düyməsi HTTP endpoint-ə çatdı: ${interaction.member?.user?.username || interaction.user?.username || 'naməlum'}`);
            return res.json({
                type: InteractionResponseType.MODAL,
                data: {
                    custom_id: 'foxcraft:confession-modal',
                    title: 'Anonim etiraf',
                    components: [{
                        type: 1,
                        components: [{
                            type: 4,
                            custom_id: 'text',
                            label: 'Etirafın',
                            style: 2,
                            min_length: 1,
                            max_length: 1000,
                            required: true,
                        }],
                    }],
                },
            });
        }
    }

    if (interaction.type === InteractionType.MESSAGE_COMPONENT &&
        interaction.data?.custom_id === 'foxcraft:ticket-category') {
        const categoryValue = interaction.data.values[0];
        const categoryMap = {
            shopping: { label: '🛒 Alış-veriş', desc: 'Ödənişlər və alış-veriş' },
            mc_problems: { label: '🛠️ Minecraft Problemləri', desc: 'Texniki xətalar' },
            complaints: { label: '⚠️ Şikayət/İrad', desc: 'Şikayət və təklif' },
            partnership: { label: '🤝 Əməkdaşlıq', desc: 'Tərəfdaşlıq' }
        };
        const selected = categoryMap[categoryValue];
        const user = interaction.member?.user || interaction.user;
        const guildId = interaction.guild_id;

        if (!selected) {
            return res.json({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: { content: 'Yanlış kateqoriya seçildi.', flags: InteractionResponseFlags.EPHEMERAL },
            });
        }

        res.json({
            type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
            data: { flags: InteractionResponseFlags.EPHEMERAL },
        });
        return; // STOP HERE to avoid "Headers already sent" error

        (async () => {
            try {
                const guild = await client.guilds.fetch(guildId);
                const safeName = user.username.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 20);

                // Find existing tickets category or support channel
                let category = guild.channels.cache.find(c => c.name === 'Tickets' && c.type === ChannelType.GuildCategory);

                // If no "Tickets" category, try to find the "🎫・dəstək" channel and use its parent category
                if (!category) {
                    const supportChannel = guild.channels.cache.find(c => (c.name === '🎫・dəstək' || c.name === 'dəstək') && c.isTextBased());
                    if (supportChannel && supportChannel.parentId) {
                        category = guild.channels.cache.get(supportChannel.parentId);
                    }
                }

                // If still no category, just use the support channel's parent if it exists, or null
                if (!category) {
                    const supportChannel = guild.channels.cache.find(c => (c.name === '🎫・dəstək' || c.name === 'dəstək') && c.isTextBased());
                    category = supportChannel ? guild.channels.cache.get(supportChannel.parentId) : null;
                }

                const channel = await guild.channels.create({
                    name: `ticket-${selected.label.split(' ')[0]}-${safeName}`,
                    type: ChannelType.GuildText,
                    parent: category ? category.id : null,
                    permissionOverwrites: [
                        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                        { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
                    ],
                    reason: `Ticket created by ${user.tag}`
                });

                // Tag Staff Roles - Using case-insensitive and trimmed search for better reliability
                const staffRolesNames = ['Qurucu', 'Admin', 'Moderator', 'Rəhbər'];
                const roleIds = [];
                const roles = await guild.roles.fetch();

                for (const roleName of staffRolesNames) {
                    const role = roles.find(r => r.name.trim().toLowerCase() === roleName.toLowerCase());
                    if (role) {
                        roleIds.push(`<@&${role.id}>`);
                    } else {
                        console.warn(`[FOXCRAFT] Role tapılmadı: ${roleName}`);
                    }
                }
                const staffMentions = roleIds.join(' ');

                const headerEmbed = {
                    ...foxcraftEmbed(selected.label, `Salam ${user}! Zəhmət olmasa probleminizi ətraflı izah edin.`),
                    fields: [
                        { name: '🔵 Prioritet', value: 'Normal', inline: true },
                        { name: '👤 Açan', value: `<@${user.id}>`, inline: true },
                    ],
                    description: `Salam <@${user.id}>! Zəhmət olmasa probleminizi ətraflı izah edin.\n\nKomandamızdan biri tezliklə sizinlə əlaqə saxlayacaq.`
                };

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('foxcraft:ticket-claim').setLabel('Öhdəsinə götür').setEmoji('🙋‍♂️').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('foxcraft:ticket-close').setLabel('Bağla').setEmoji('🔒').setStyle(ButtonStyle.Danger)
                );

                await channel.send({
                    content: staffMentions,
                    embeds: [headerEmbed],
                    components: [row]
                });

                // Notify user
                const applicationId = interaction.application_id || process.env.CLIENT_ID;
                await fetch(`https://discord.com/api/v10/webhooks/${applicationId}/${interaction.token}/messages/@original`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: `Ticketiniz yaradıldı: ${channel}` }),
                });

            } catch (error) {
                console.error('[FOXCRAFT] Ticket yaratma xətası:', error);
            }
        })();
    }

    if (interaction.type === InteractionType.MODAL_SUBMIT &&
        interaction.data?.custom_id === 'foxcraft:confession-modal') {
        const applicationId = interaction.application_id || process.env.CLIENT_ID;
        const token = interaction.token;
        const user = interaction.member?.user || interaction.user;
        const content = interaction.data.components
            ?.flatMap((row) => row.components || [])
            .find((component) => component.custom_id === 'text')?.value?.trim();
        res.json({
            type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
            data: { flags: InteractionResponseFlags.EPHEMERAL },
        });
        (async () => {
            try {
                if (!content) throw new Error('Etiraf mətni boşdur');
                const guild = await client.guilds.fetch(interaction.guild_id);
                const channels = await guild.channels.fetch();
                const channel = channels.find((item) => item?.name === '🤫・etiraf' && item.isTextBased());
                if (!channel) throw new Error('🤫・etiraf kanalı tapılmadı');
                await channel.send({ embeds: [foxcraftEmbed('Anonim etiraf', content)] });
                await auditLog(guild, 'Anonim etiraf göndərildi', `${user?.username || 'İstifadəçi'} anonim etiraf panelindən istifadə etdi.`);
                console.log(`[FOXCRAFT] HTTP etiraf göndərildi: ${user?.username || 'naməlum'}`);
                await fetch(`https://discord.com/api/v10/webhooks/${applicationId}/${token}/messages/@original`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: 'Etirafın anonim şəkildə göndərildi.' }),
                });
            } catch (error) {
                console.error('[FOXCRAFT LOG] HTTP etiraf əməliyyatı uğursuz oldu:', {
                    message: error.message,
                    code: error.code ?? null,
                    status: error.status ?? error.httpStatus ?? null,
                });
                await fetch(`https://discord.com/api/v10/webhooks/${applicationId}/${token}/messages/@original`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: 'Etiraf göndərilmədi. Problem konsolda qeyd edildi.' }),
                }).catch(() => {});
            }
        })();
        return;
    }

    // STEP B: Slash Command Interactions
    if (interaction.type === InteractionType.APPLICATION_COMMAND) {
        const { name } = interaction.data;
        const command = commands.get(name);

        if (!command) {
            return res.json({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: `Bu serverdə \`/${name}\` əmri tanınmır.`,
                    flags: InteractionResponseFlags.EPHEMERAL
                }
            });
        }

        // Extract user ID (works in Guild context, Bot DMs, and Group DMs)
        const userId = interaction.user?.id || interaction.member?.user?.id;

        // Rate Limiting (1 command every 3 seconds per user)
        if (isRateLimited(userId)) {
            return res.json({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: 'Zəhmət olmasa, növbəti əmrdən əvvəl 3 saniyə gözlə.',
                    flags: InteractionResponseFlags.EPHEMERAL
                }
            });
        }

        try {
            // Make the live shared config available to every command invocation.
            const guildId = interaction.guild_id;
            interaction.guildConfig = getGuildConfig(guildId);
            interaction.discordClient = client;
            if (name === 'foxcraft' && client.isReady()) {
                client.user.setPresence({
                    activities: [{ name: 'FoxCraft | Minecraft', type: ActivityType.Playing }],
                    status: 'online',
                });
            }
            const response = await command.execute(interaction);
            const followUpMessages = response.followUpMessages;
            delete response.followUpMessages;
            res.json(response);

            const applicationId = interaction.application_id || process.env.CLIENT_ID;
            if (Array.isArray(followUpMessages) && followUpMessages.length > 0 && applicationId) {
                for (const content of followUpMessages) {
                    const followUp = await fetch(`https://discord.com/api/v10/webhooks/${applicationId}/${interaction.token}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ content }),
                    });
                    if (!followUp.ok) {
                        console.error('Discord rejected interaction follow-up:', followUp.status, await followUp.text());
                        break;
                    }
                }
            }
            return;
        } catch (error) {
            console.error(`[FOXCRAFT] /${name} əmri uğursuz oldu:`, error);
            return res.json({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: 'Əmr icra edilərkən gözlənilməz xəta baş verdi.',
                    flags: InteractionResponseFlags.EPHEMERAL
                }
            });

        }
    }

    // Unhandled interaction type fallback
    return res.status(400).json({ error: 'Unknown interaction type' });
});

app.use(express.json());

function tokensMatch(left, right) {
    if (!left || !right) return false;
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

app.post('/api/guilds/:guildId/messages', async (req, res) => {
    const authorization = req.get('Authorization') || '';
    if (!authorization.startsWith('Bearer ') ||
        !tokensMatch(authorization.slice(7), process.env.BOT_API_TOKEN)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { channelId, type, content, title, description, color, fields, mentionEveryone } = req.body;
    if (!channelId || !['embed', 'announce'].includes(type)) {
        return res.status(400).json({ error: 'Invalid message request' });
    }

    const payload = {
        content: type === 'announce' ? String(content || '').slice(0, 2000) : undefined,
        embeds: type === 'embed' ? [{
            title: String(title || '').slice(0, 256),
            description: String(description || '').slice(0, 4096),
            color: Number.isInteger(color) ? color : 0xFF6B35,
            fields: Array.isArray(fields) ? fields.slice(0, 25).map((field) => ({
                name: String(field.name || '').slice(0, 256),
                value: String(field.value || '').slice(0, 1024),
                inline: Boolean(field.inline),
            })) : [],
            footer: {
                text: 'FoxCraft | Azərbaycan Minecraft icması',
                ...(envValue('FOXCRAFT_LOGO_URL') ? { icon_url: envValue('FOXCRAFT_LOGO_URL') } : {}),
            },
        }] : undefined,
        allowed_mentions: mentionEveryone ? { parse: ['everyone'] } : { parse: [] },
    };

    try {
        const discordResponse = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
            method: 'POST',
            headers: {
                Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        if (!discordResponse.ok) {
            return res.status(discordResponse.status).json({ error: 'Discord rejected the message' });
        }
        return res.status(201).json({ ok: true, message: await discordResponse.json() });
    } catch (error) {
        console.error('Failed to send bot message:', error);
        return res.status(502).json({ error: 'Discord request failed' });
    }
});

// ==============================================================================
// 5. SERVER STARTUP
// ==============================================================================
let server = null;

if (!process.env.VERCEL && hasValidPublicKey) {
    server = app.listen(PORT, () => {
        console.log(`\n[FOXCRAFT] HTTP tətbiqi http://localhost:${PORT} ünvanında işləyir`);
        console.log(`📡 Set your Discord Interactions Endpoint URL to: https://<your-domain>/interactions`);
        console.log('[FOXCRAFT] İmza yoxlaması aktivdir (PUBLIC_KEY)');
        console.log(`[FOXCRAFT] ${commands.size} slash əmri və ! prefix əmrləri yükləndi.\n`);
    });
}

module.exports = { app, server, client, commands };
