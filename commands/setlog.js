const {
    ChannelType,
    EmbedBuilder,
    PermissionFlagsBits,
    SlashCommandBuilder,
} = require('discord.js');
const { setLogChannelId } = require('../utils/storage');
const { ephemeralReply, getOption } = require('../utils/interaction');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setlog')
        .setDescription('Server loqlarının göndəriləcəyi kanalı təyin edir')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption((option) =>
            option
                .setName('kanal')
                .setDescription('Loqların göndəriləcəyi mətn kanalı')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(true)
        ),

    async execute(interaction) {
        // Resolve guild & member
        const guildId = interaction.guild_id || interaction.guild?.id;
        if (!guildId) return ephemeralReply('Bu əmr yalnız Discord serverində istifadə edilə bilər.');

        // Permission check for user
        const memberPermissions = interaction.member?.permissions;
        const isAdmin = interaction.member?.permissions?.has
            ? interaction.member.permissions.has(PermissionFlagsBits.Administrator)
            : (BigInt(memberPermissions || 0) & BigInt(PermissionFlagsBits.Administrator)) === BigInt(PermissionFlagsBits.Administrator);

        if (!isAdmin) {
            return ephemeralReply('Bu əmri yalnız Administratorlar istifadə edə bilər.');
        }

        // Resolve target channel
        let channelId = null;
        if (interaction.options?.getChannel) {
            const ch = interaction.options.getChannel('kanal');
            channelId = ch?.id;
        }
        if (!channelId) {
            channelId = getOption(interaction, 'kanal') || interaction.options?.get('kanal')?.value;
        }

        if (!channelId) {
            return ephemeralReply('Kanal seçilmədi.');
        }

        const client = interaction.discordClient || interaction.client;
        let guild = interaction.guild;
        if (!guild && client) {
            guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
        }
        if (!guild) return ephemeralReply('Server məlumatları əldə edilmədi.');

        const targetChannel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
        if (!targetChannel || !targetChannel.isTextBased()) {
            return ephemeralReply('Seçilən kanal tapılmadı və ya uyğun mətn kanalı deyil.');
        }

        // Check bot permissions in target channel
        const me = guild.members.me || (client?.user ? await guild.members.fetch(client.user.id).catch(() => null) : null);
        if (me) {
            const botPerms = targetChannel.permissionsFor(me);
            const missing = [];
            if (!botPerms?.has(PermissionFlagsBits.ViewChannel)) missing.push('Kanala Baxmaq (View Channel)');
            if (!botPerms?.has(PermissionFlagsBits.SendMessages)) missing.push('Mesaj Göndərmək (Send Messages)');
            if (!botPerms?.has(PermissionFlagsBits.EmbedLinks)) missing.push('Keçid/Embed Əlavə Etmək (Embed Links)');

            if (missing.length > 0) {
                return ephemeralReply(
                    `❌ Botun ${targetChannel} kanalında aşağıdakı icazələri çatışmır:\n` +
                    missing.map(p => `• **${p}**`).join('\n') +
                    '\n\nZəhmət olmasa həmin kanalın parametrlərindən bota bu icazələri verin və yenidən cəhd edin.'
                );
            }
        }

        // Save to multi-backend storage
        await setLogChannelId(guildId, targetChannel.id);

        // Send a test embed into the newly configured log channel
        const testEmbed = new EmbedBuilder()
            .setTitle('✅ Server Loq Sistemi Aktivləşdirildi')
            .setColor(0x57F287)
            .setDescription('Bu kanal artıq AzeSpace / FoxCraft server loqları üçün rəsmi kanal olaraq təyin edildi.')
            .addFields([
                { name: '📍 Kanal', value: `${targetChannel} (\`${targetChannel.name}\`)`, inline: true },
                { name: '🛠️ Təyin Edən', value: `<@${interaction.user?.id || interaction.member?.user?.id}>`, inline: true },
                { name: '📅 Tarix', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
            ])
            .setFooter({ text: 'FoxCraft Loq Sistemi' })
            .setTimestamp();

        await targetChannel.send({ embeds: [testEmbed] }).catch((err) => {
            console.error('[SETLOG] Test mesajı göndərilmədi:', err.message);
        });

        const replyEmbed = new EmbedBuilder()
            .setTitle('✅ Loq Kanalı Uğurla Təyin Edildi')
            .setColor(0x57F287)
            .setDescription(`Bütün server loqları artıq ${targetChannel} kanalına göndəriləcək.`)
            .addFields([
                { name: '📍 Təyin Edilmiş Kanal', value: `${targetChannel} (\`${targetChannel.id}\`)`, inline: true },
                { name: '📊 Status', value: '🟢 Aktiv', inline: true },
            ])
            .setFooter({ text: 'Dəyişmək üçün yenidən /setlog əmrini istifadə edə bilərsiniz.' })
            .setTimestamp();

        if (typeof interaction.reply === 'function' && !interaction.replied && !interaction.deferred) {
            return interaction.reply({ embeds: [replyEmbed], ephemeral: true });
        }

        return ephemeralReply(null, [replyEmbed.toJSON()]);
    },

    prefixExecute: async (message, args) => {
        if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('Bu əmri yalnız Administratorlar istifadə edə bilər.');
        }

        const channelMention = message.mentions.channels.first();
        const rawId = args[0]?.replace(/[<#>]/g, '');
        const targetChannel = channelMention || (rawId ? message.guild.channels.cache.get(rawId) : null);

        if (!targetChannel || !targetChannel.isTextBased()) {
            return message.reply('❌ Zəhmət olmasa düzgün bir mətn kanalı qeyd edin: `!setlog #kanal`');
        }

        const me = message.guild.members.me;
        if (me) {
            const botPerms = targetChannel.permissionsFor(me);
            const missing = [];
            if (!botPerms?.has(PermissionFlagsBits.ViewChannel)) missing.push('Kanala Baxmaq (View Channel)');
            if (!botPerms?.has(PermissionFlagsBits.SendMessages)) missing.push('Mesaj Göndərmək (Send Messages)');
            if (!botPerms?.has(PermissionFlagsBits.EmbedLinks)) missing.push('Keçid/Embed Əlavə Etmək (Embed Links)');

            if (missing.length > 0) {
                return message.reply(
                    `❌ Botun ${targetChannel} kanalında aşağıdakı icazələri çatışmır:\n` +
                    missing.map(p => `• **${p}**`).join('\n') +
                    '\n\nZəhmət olmasa həmin kanalın parametrlərindən bota bu icazələri verin və yenidən cəhd edin.'
                );
            }
        }

        await setLogChannelId(message.guild.id, targetChannel.id);

        const testEmbed = new EmbedBuilder()
            .setTitle('✅ Server Loq Sistemi Aktivləşdirildi')
            .setColor(0x57F287)
            .setDescription('Bu kanal artıq AzeSpace / FoxCraft server loqları üçün rəsmi kanal olaraq təyin edildi.')
            .addFields([
                { name: '📍 Kanal', value: `${targetChannel} (\`${targetChannel.name}\`)`, inline: true },
                { name: '🛠️ Təyin Edən', value: `${message.author}`, inline: true },
                { name: '📅 Tarix', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
            ])
            .setFooter({ text: 'FoxCraft Loq Sistemi' })
            .setTimestamp();

        await targetChannel.send({ embeds: [testEmbed] }).catch(() => {});

        const replyEmbed = new EmbedBuilder()
            .setTitle('✅ Loq Kanalı Uğurla Təyin Edildi')
            .setColor(0x57F287)
            .setDescription(`Bütün server loqları artıq ${targetChannel} kanalına göndəriləcək.`)
            .setTimestamp();

        return message.reply({ embeds: [replyEmbed] });
    },
};
