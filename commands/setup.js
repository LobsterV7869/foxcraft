const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    PermissionFlagsBits,
    SlashCommandBuilder,
} = require('discord.js');
const path = require('path');
const { ephemeralReply, publicReply } = require('../utils/interaction');
const { envValue, foxcraftEmbed, isGuildOwnerOrAdmin } = require('../utils/foxcraft');

const { t } = require('../utils/lang');

const ROLE_DEFINITIONS = [
    ['Sahibi', 0xe74c3c], ['Qurucu', 0xf39c12], ['Developer', 0x3498db],
    ['Admin', 0xe74c3c], ['Moderator', 0x9b59b6], ['Test Moderator', 0xb48ead],
    ['Yetkili Cavabdehi', 0xe67e22], ['Medya', 0x1abc9c],
    ['Xüsusi Üzv', 0xf1c40f], ['Premium', 0xe91e63], ['FoxVip+', 0xff6b35],
    ['FoxVip', 0xff8c42], ['VIP+', 0x2ecc71], ['VIP', 0x27ae60],
    ['Lady', 0xff69b4], ['Oyuncu', 0x7f8c8d],
];

const CATEGORY_DEFINITIONS = [
    {
        name: 'FoxCraft',
        channels: [
            ['👋・lobi', ChannelType.GuildText],
            ['📢・elanlar', ChannelType.GuildText],
            ['📜・qaydalar', ChannelType.GuildText],
            ['📊・anketlər', ChannelType.GuildText],
            ['🎁・çəkiliş', ChannelType.GuildText],
            ['🎉・etkinliklər', ChannelType.GuildText],
        ],
    },
    {
        name: 'Söhbət',
        channels: [
            ['💬・söhbət', ChannelType.GuildText],
            ['🖼️・media', ChannelType.GuildText],
            ['🤖・bot-əmr', ChannelType.GuildText],
            ['💡・təklif-istək', ChannelType.GuildText],
            ['🔢・sayı-sayma', ChannelType.GuildText],
            ['🔤・söz-oyunu', ChannelType.GuildText],
            ['🤫・etiraf', ChannelType.GuildText],
            ['⚔️・klan-alım', ChannelType.GuildText],
        ],
    },
    {
        name: 'Dəstək',
        channels: [['🎫・dəstək', ChannelType.GuildText]],
    },
    {
        name: 'Səs kanalları',
        channels: [
            ['Səs 1', ChannelType.GuildVoice],
            ['Səs 2', ChannelType.GuildVoice],
            ['Səs 3', ChannelType.GuildVoice],
            ['Özel Səs 1', ChannelType.GuildVoice],
            ['Özel Səs 2', ChannelType.GuildVoice],
            ['Özel Səs 3', ChannelType.GuildVoice],
            ['Staff Səs', ChannelType.GuildVoice],
            ['🔒・Xüsusi otaq', ChannelType.GuildVoice],
        ],
    },
];

const LOG_CHANNEL_NAME = '🛡️・mod-loglar';
const STAFF_CATEGORY_NAME = '🛡️・Staff';
const STAFF_CHANNELS = [
    ['💬・staff-chat', ChannelType.GuildText],
    [LOG_CHANNEL_NAME, ChannelType.GuildText],
    ['🔊・staff-səs', ChannelType.GuildVoice],
];
const STAFF_ROLE_NAMES = [
    'Sahibi',
    'Qurucu',
    'Developer',
    'Admin',
    'Moderator',
    'Rehber',
    'Test Moderator',
    'Yetkili Cavabdehi',
];
const SPECIAL_VOICE_CATEGORY = '🔒・Xüsusi otaqlar';
const SPECIAL_VOICE_TRIGGER = '➕・Xüsusi otaq yarat';
const READ_ONLY_CHANNELS = [
    '📢・elanlar',
    '📜・qaydalar',
    '👋・lobi',
    '🎁・çəkiliş',
    '📊・anketlər',
    '🎉・etkinliklər',
    '🤫・etiraf',
    '🎫・dəstək',
];

async function ensurePanel(channel, customId, payload) {
    const messages = await channel.messages.fetch({ limit: 25 });
    const existing = messages.find((message) => message.author?.bot && message.components
        .flatMap((row) => row.components)
        .some((button) => button.customId === customId));
    const components = [new ActionRowBuilder().addComponents(
        ...payload.buttons.map((button) => new ButtonBuilder()
            .setCustomId(button.id)
            .setLabel(button.label)
            .setStyle(button.style))
    )];
    const body = { embeds: [payload.embed], components };
    if (existing) {
        await existing.edit(body);
        return false;
    }
    await channel.send(body);
    return true;
}

async function ensureChannelPrompt(channel, targetChannel) {
    const marker = 'FoxCraft kanal keçidi';
    const messages = await channel.messages.fetch({ limit: 25 });
    const existing = messages.find((message) => message.author?.bot && message.content.includes(marker));
    const content = `Hamısını oxudun? ${targetChannel} kanalına göz at.\n\n${marker}`;
    const components = [{
        type: 1,
        components: [{
            type: 2,
            style: 5,
            label: 'Söhbətə keç',
            emoji: { name: '➡️' },
            url: `https://discord.com/channels/${channel.guild.id}/${targetChannel.id}`,
        }],
    }];
    if (existing) {
        await existing.edit({ content, components });
        return false;
    }
    const message = await channel.send({ content, components });
    await message.pin('FoxCraft kanal keçidi');
    return true;
}

function logFailure(action, error) {
    console.error(`[FOXCRAFT SETUP] ${action} uğursuz oldu:`, JSON.stringify({
        message: error.message,
        code: error.code ?? null,
        status: error.status ?? error.httpStatus ?? null,
    }));
}

function authorizedPrefixMessage(message) {
    return Boolean(
        message.guild &&
        (message.guild.ownerId === message.author.id ||
            message.member.permissions.has(PermissionFlagsBits.Administrator) ||
            (envValue('OWNER_ID') && envValue('OWNER_ID') === message.author.id))
    );
}

async function setupGuild(guild) {
    const summary = [];
    const existingChannels = await guild.channels.fetch();
    const existingRoles = await guild.roles.fetch();
    const emojis = await guild.emojis.fetch();
    if (!emojis.find((emoji) => emoji.name === 'foxcraft_check')) {
        try {
            await guild.emojis.create({
                attachment: path.join(__dirname, '..', 'assets', 'foxcraft-check.png'),
                name: 'foxcraft_check',
                reason: 'FoxCraft təsdiq reaksiyası',
            });
            summary.push('Xüsusi emoji yaradıldı: foxcraft_check');
        } catch (error) {
            logFailure('Xüsusi emoji yarat foxcraft_check', error);
        }
    }
    const categories = new Map(
        existingChannels.filter((channel) => channel.type === ChannelType.GuildCategory)
            .map((category) => [category.name, category])
    );
    let staffCategory = categories.get(STAFF_CATEGORY_NAME);
    if (!staffCategory) {
        try {
            staffCategory = await guild.channels.create({
                name: STAFF_CATEGORY_NAME,
                type: ChannelType.GuildCategory,
                reason: 'FoxCraft staff kanalları',
            });
            summary.push(`Kateqoriya yaradıldı: ${STAFF_CATEGORY_NAME}`);
        } catch (error) {
            logFailure(`Kateqoriya yarat ${STAFF_CATEGORY_NAME}`, error);
        }
    }
    let specialVoiceCategory = categories.get(SPECIAL_VOICE_CATEGORY);
    if (!specialVoiceCategory) {
        try {
            specialVoiceCategory = await guild.channels.create({
                name: SPECIAL_VOICE_CATEGORY,
                type: ChannelType.GuildCategory,
                reason: 'FoxCraft xüsusi səs otaqları',
            });
            summary.push(`Kateqoriya yaradıldı: ${SPECIAL_VOICE_CATEGORY}`);
        } catch (error) {
            logFailure(`Kateqoriya yarat ${SPECIAL_VOICE_CATEGORY}`, error);
        }
    }

    const renameMap = new Map([
        ['söhbət', '💬・söhbət'],
        ['media', '🖼️・media'],
        ['bot-əmr', '🤖・bot-əmr'],
        ['klan-alım', '⚔️・klan-alım'],
        ['dəstək', '🎫・dəstək'],
        ['Xüsusi otaq', '🔒・Xüsusi otaq'],
    ]);
    for (const [oldName, newName] of renameMap) {
        const channel = existingChannels.find((item) => item.name === oldName);
        if (!channel || existingChannels.some((item) => item.name === newName)) continue;
        try {
            await channel.setName(newName, 'FoxCraft emoji kanal adları');
            summary.push(`Kanal adı yeniləndi: ${newName}`);
        } catch (error) {
            logFailure(`Kanal adını yenilə ${oldName}`, error);
        }
    }

    for (const definition of CATEGORY_DEFINITIONS) {
        let category = categories.get(definition.name);
        if (!category) {
            try {
                category = await guild.channels.create({
                    name: definition.name,
                    type: ChannelType.GuildCategory,
                    reason: 'FoxCraft server setup',
                });
                categories.set(category.name, category);
                summary.push(`Kateqoriya yaradıldı: ${definition.name}`);
            } catch (error) {
                logFailure(`Kateqoriya yarat ${definition.name}`, error);
                summary.push(`Kateqoriya yaradıla bilmədi: ${definition.name}`);
                continue;
            }
        }

        for (const [name, type] of definition.channels) {
            const exists = existingChannels.find(
                (channel) => channel.name === name && channel.type === type
            );
            if (exists) continue;
            try {
                await guild.channels.create({
                    name,
                    type,
                    parent: category.id,
                    reason: 'FoxCraft server setup',
                });
                summary.push(`Kanal yaradıldı: ${name}`);
            } catch (error) {
                logFailure(`Kanal yarat ${name}`, error);
                summary.push(`Kanal yaradıla bilmədi: ${name}`);
            }
        }
    }

    for (const [name, color] of ROLE_DEFINITIONS) {
        const role = existingRoles.find((item) => item.name === name && !item.managed);
        if (role) {
            try {
                if (role.color !== color) await role.edit({ color, reason: 'FoxCraft server setup' });
            } catch (error) {
                logFailure(`Rol rəngini yenilə ${name}`, error);
            }

            continue;
        }
        try {
            await guild.roles.create({
                name,
                color,
                permissions: [],
                reason: 'FoxCraft server setup',
            });
            summary.push(`Rol yaradıldı: ${name}`);
        } catch (error) {
            logFailure(`Rol yarat ${name}`, error);
            summary.push(`Rol yaradıla bilmədi: ${name}`);
        }
    }

    const staffRoles = existingRoles.filter((role) => STAFF_ROLE_NAMES.includes(role.name) && !role.managed);
    if (staffCategory) {
        for (const [name, type] of STAFF_CHANNELS) {
            let channel = existingChannels.find((item) => item.name === name && item.type === type);
            try {
                if (!channel) {
                    channel = await guild.channels.create({
                        name,
                        type,
                        parent: staffCategory.id,
                        reason: 'FoxCraft staff kanalı',
                    });
                    summary.push(`Staff kanalı yaradıldı: ${name}`);
                } else if (channel.parentId !== staffCategory.id) {
                    await channel.setParent(staffCategory.id, { lockPermissions: false, reason: 'FoxCraft staff kateqoriyası' });
                }

                const overwrites = [
                    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    ...staffRoles.map((role) => ({
                        id: role.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
                    })),
                ];
                await channel.permissionOverwrites.set(overwrites, 'FoxCraft staff giriş qaydaları');
            } catch (error) {
                logFailure(`Staff kanalını qur ${name}`, error);
            }
        }
    }

    const currentChannels = await guild.channels.fetch();
    if (specialVoiceCategory && !currentChannels.some((channel) => channel.name === SPECIAL_VOICE_TRIGGER && channel.type === ChannelType.GuildVoice)) {
        try {
            await guild.channels.create({
                name: SPECIAL_VOICE_TRIGGER,
                type: ChannelType.GuildVoice,
                parent: specialVoiceCategory.id,
                reason: 'FoxCraft xüsusi səs otağı yaratma kanalı',
            });
            summary.push(`Səs kanalı yaradıldı: ${SPECIAL_VOICE_TRIGGER}`);
        } catch (error) {
            logFailure(`Səs kanalı yarat ${SPECIAL_VOICE_TRIGGER}`, error);
        }
    }

    const refreshedChannels = await guild.channels.fetch();
    for (const channel of refreshedChannels.values()) {
        if (!channel?.isTextBased() || !channel.permissionOverwrites) continue;
        try {
            await channel.permissionOverwrites.edit(guild.roles.everyone, {
                CreatePublicThreads: false,
                CreatePrivateThreads: false,
                SendMessagesInThreads: false,
            }, 'FoxCraft thread icazələrini bağla');
        } catch (error) {
            logFailure(`Thread icazələrini bağla ${channel.name}`, error);
        }
    }
    for (const channelName of READ_ONLY_CHANNELS) {
        const channel = refreshedChannels.find((item) => item?.name === channelName && item.isTextBased());
        if (!channel) continue;
        try {
            await channel.permissionOverwrites.edit(guild.roles.everyone, {
                SendMessages: false,
            }, 'FoxCraft kilidli kanal qaydası');
        } catch (error) {
            logFailure(`Send Messages bağla ${channelName}`, error);
        }
    }
    const ticketChannel = refreshedChannels.find((channel) => channel.name === '🎫・dəstək');
    const confessionChannel = refreshedChannels.find((channel) => channel.name === '🤫・etiraf');
    const chatChannel = refreshedChannels.find((channel) => channel.name === '💬・söhbət');
    const promptChannelNames = [
        '📢・elanlar',
        '📜・qaydalar',
        '👋・lobi',
        '🎁・çəkiliş',
        '📊・anketlər',
        '🎉・etkinliklər',
        '🤫・etiraf',
        '🎫・dəstək',
    ];
    if (chatChannel) {
        for (const name of promptChannelNames) {
            const channel = refreshedChannels.find((item) => item.name === name && item.isTextBased());
            if (!channel) continue;
            try {
                if (await ensureChannelPrompt(channel, chatChannel)) {
                    summary.push(`Kanal keçidi əlavə edildi: ${name}`);
                }
            } catch (error) {
                logFailure(`Kanal keçidi əlavə et ${name}`, error);
            }
        }
    }
    if (ticketChannel) {
        try {
            if (await ensurePanel(ticketChannel, 'foxcraft:ticket', {
                embed: {
                    ...foxcraftEmbed('🎫 FoxCraft Dəstək Mərkəzi', 'Problemin var? Dəstək komandamız sənə kömək etməyə hazırdır.'),
                    fields: [
                        { name: 'Nə etməlisən?', value: 'Düyməyə bas, ayrıca və gizli dəstək kanalı yaransın.', inline: false },
                        { name: 'Dəstək qaydası', value: 'Problemini ətraflı və aydın şəkildə yaz. Spam ticket açma.', inline: false },
                        { name: 'Cavab müddəti', value: 'Staff komandası imkan daxilində tezliklə cavab verəcək.', inline: false },
                    ],
                },
                buttons: [
                    { id: 'foxcraft:ticket', label: '🎫 Ticket yarat', style: ButtonStyle.Primary },
                ],
            })) {
                summary.push('Ticket paneli əlavə edildi.');
            }
        } catch (error) {
            logFailure('Ticket paneli yarat', error);
        }
    }
    if (confessionChannel) {
        try {
            if (await ensurePanel(confessionChannel, 'foxcraft:confession', {
                embed: {
                    ...foxcraftEmbed('🤍 Anonim Etiraf', 'Düşüncəni rahat şəkildə paylaş. Adın etiraf mesajında görünməyəcək.'),
                    fields: [
                        { name: 'Məxfilik', value: 'Etiraf kanalda anonim yayımlanır.', inline: true },
                        { name: 'Qayda', value: 'Təhqir, ayrı-seçkilik və şəxsi məlumat paylaşma.', inline: true },
                        { name: 'Necə göndərim?', value: 'Aşağıdakı düyməyə bas və etirafını yaz.', inline: false },
                    ],
                },
                buttons: [
                    { id: 'foxcraft:confession', label: '🤍 Etiraf yaz', style: ButtonStyle.Secondary },
                ],
            })) {
                summary.push('Etiraf paneli əlavə edildi.');
            }
        } catch (error) {
            logFailure('Etiraf paneli yarat', error);
        }
    }

    if (summary.length === 0) summary.push('Bütün FoxCraft kateqoriya, kanal və rolları artıq mövcuddur.');
    return summary;
}

module.exports = {
    setupGuild,
    data: new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Sets up the FoxCraft channels, roles and panels'),
    async execute(interaction) {
        if (!interaction.guild_id) return ephemeralReply(t(interaction.guild_id, 'server_only'));
        let guild;
        try {
            guild = await interaction.discordClient.guilds.fetch(interaction.guild_id);
        } catch (error) {
            logFailure('Serveri yüklə', error);
            return ephemeralReply(t(interaction.guild_id, 'guild_load_failed'));
        }
        if (!isGuildOwnerOrAdmin(interaction, await guild.fetch())) {
            return ephemeralReply(t(interaction.guild_id, 'perm_owner_or_admin'));
        }
        const summary = await setupGuild(guild);
        return ephemeralReply(null, [foxcraftEmbed('FoxCraft setup', summary.join('\n'))]);
    },
    prefixExecute: async (message) => {
        if (!authorizedPrefixMessage(message)) {
            return message.reply(t(message.guild?.id, 'perm_owner_or_admin'));
        }
        const summary = await setupGuild(message.guild);
        return message.reply({ embeds: [foxcraftEmbed('FoxCraft setup', summary.join('\n'))] });
    },
};
