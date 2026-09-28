const {
    EmbedBuilder,
    PermissionFlagsBits,
    SlashCommandBuilder,
} = require('discord.js');
const { getLogChannelId } = require('../utils/storage');
const { ephemeralReply } = require('../utils/interaction');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('logstatus')
        .setDescription('Server loq sisteminin hazırkı vəziyyətini göstərir')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const guildId = interaction.guild_id || interaction.guild?.id;
        if (!guildId) return ephemeralReply('Bu əmr yalnız Discord serverində istifadə edilə bilər.');

        const client = interaction.discordClient || interaction.client;
        let guild = interaction.guild;
        if (!guild && client) {
            guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
        }
        if (!guild) return ephemeralReply('Server məlumatları əldə edilmədi.');

        const channelId = await getLogChannelId(guildId);

        let statusText = '🔴 Deaktiv (Kanal təyin edilməyib)';
        let channelMention = '*Təyin edilməyib*';
        let channelIdText = '*Yoxdur*';
        let healthText = '⚠️ Loqların işləməsi üçün `/setlog #kanal` əmri ilə kanal təyin edin.';
        let color = 0xED4245;

        if (channelId) {
            const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);

            if (!channel) {
                statusText = '⚠️ Xəta (Təyin olunmuş kanal tapılmadı və ya silinib)';
                channelMention = `<#${channelId}> *(Tapılmadı)*`;
                channelIdText = `\`${channelId}\``;
                healthText = '❌ Təyin olunmuş kanal serverdə mövcud deyil. Zəhmət olmasa `/setlog #kanal` ilə yeni kanal seçin.';
                color = 0xE67E22;
            } else {
                channelMention = `${channel} (\`#${channel.name}\`)`;
                channelIdText = `\`${channel.id}\``;

                const me = guild.members.me || (client?.user ? await guild.members.fetch(client.user.id).catch(() => null) : null);
                if (me) {
                    const botPerms = channel.permissionsFor(me);
                    const missing = [];
                    if (!botPerms?.has(PermissionFlagsBits.ViewChannel)) missing.push('Kanala Baxmaq (View Channel)');
                    if (!botPerms?.has(PermissionFlagsBits.SendMessages)) missing.push('Mesaj Göndərmək (Send Messages)');
                    if (!botPerms?.has(PermissionFlagsBits.EmbedLinks)) missing.push('Keçid/Embed Əlavə Etmək (Embed Links)');

                    if (missing.length > 0) {
                        statusText = '⚠️ Diqqət (İcazə çatışmazlığı)';
                        healthText = `❌ Botun bu kanalda bəzi icazələri yoxdur:\n` + missing.map(p => `• **${p}**`).join('\n');
                        color = 0xF1C40F;
                    } else {
                        statusText = '🟢 Aktiv və Hazır';
                        healthText = '✅ Bot tələb olunan bütün icazələrə malikdir (`ViewChannel`, `SendMessages`, `EmbedLinks`). Bütün server hadisələri qeyd olunur.';
                        color = 0x57F287;
                    }
                } else {
                    statusText = '🟢 Aktiv';
                    healthText = 'Kanal təyin edilib.';
                    color = 0x57F287;
                }
            }
        }

        const embed = new EmbedBuilder()
            .setTitle('📋 Server Loq Sistemi Statusu')
            .setColor(color)
            .setDescription(`**${guild.name}** serveri üçün loq parametrləri:`)
            .addFields([
                { name: '📊 Loq Sistemi Statusu', value: statusText, inline: true },
                { name: '📍 Təyin Edilmiş Kanal', value: channelMention, inline: true },
                { name: '🆔 Kanal ID', value: channelIdText, inline: true },
                { name: '🩺 Sağlamlıq və İcazələr', value: healthText, inline: false },
                { name: '💡 Kanalı Dəyişmək', value: 'Loq kanalını dəyişmək və ya təyin etmək üçün `/setlog #kanal` əmrindən istifadə edin.', inline: false },
            ])
            .setFooter({ text: 'FoxCraft Server Loq Sistemi' })
            .setTimestamp();

        if (typeof interaction.reply === 'function' && !interaction.replied && !interaction.deferred) {
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        return ephemeralReply(null, [embed.toJSON()]);
    },

    prefixExecute: async (message) => {
        if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('Bu əmri yalnız Administratorlar istifadə edə bilər.');
        }

        const guild = message.guild;
        const channelId = await getLogChannelId(guild.id);

        let statusText = '🔴 Deaktiv (Kanal təyin edilməyib)';
        let channelMention = '*Təyin edilməyib*';
        let channelIdText = '*Yoxdur*';
        let healthText = '⚠️ Loqların işləməsi üçün `!setlog #kanal` əmri ilə kanal təyin edin.';
        let color = 0xED4245;

        if (channelId) {
            const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);

            if (!channel) {
                statusText = '⚠️ Xəta (Təyin olunmuş kanal tapılmadı və ya silinib)';
                channelMention = `<#${channelId}> *(Tapılmadı)*`;
                channelIdText = `\`${channelId}\``;
                healthText = '❌ Təyin olunmuş kanal serverdə mövcud deyil. Zəhmət olmasa `!setlog #kanal` ilə yeni kanal seçin.';
                color = 0xE67E22;
            } else {
                channelMention = `${channel} (\`#${channel.name}\`)`;
                channelIdText = `\`${channel.id}\``;

                const me = guild.members.me;
                if (me) {
                    const botPerms = channel.permissionsFor(me);
                    const missing = [];
                    if (!botPerms?.has(PermissionFlagsBits.ViewChannel)) missing.push('Kanala Baxmaq (View Channel)');
                    if (!botPerms?.has(PermissionFlagsBits.SendMessages)) missing.push('Mesaj Göndərmək (Send Messages)');
                    if (!botPerms?.has(PermissionFlagsBits.EmbedLinks)) missing.push('Keçid/Embed Əlavə Etmək (Embed Links)');

                    if (missing.length > 0) {
                        statusText = '⚠️ Diqqət (İcazə çatışmazlığı)';
                        healthText = `❌ Botun bu kanalda bəzi icazələri yoxdur:\n` + missing.map(p => `• **${p}**`).join('\n');
                        color = 0xF1C40F;
                    } else {
                        statusText = '🟢 Aktiv və Hazır';
                        healthText = '✅ Bot tələb olunan bütün icazələrə malikdir (`ViewChannel`, `SendMessages`, `EmbedLinks`). Bütün server hadisələri qeyd olunur.';
                        color = 0x57F287;
                    }
                }
            }
        }

        const embed = new EmbedBuilder()
            .setTitle('📋 Server Loq Sistemi Statusu')
            .setColor(color)
            .setDescription(`**${guild.name}** serveri üçün loq parametrləri:`)
            .addFields([
                { name: '📊 Loq Sistemi Statusu', value: statusText, inline: true },
                { name: '📍 Təyin Edilmiş Kanal', value: channelMention, inline: true },
                { name: '🆔 Kanal ID', value: channelIdText, inline: true },
                { name: '🩺 Sağlamlıq və İcazələr', value: healthText, inline: false },
                { name: '💡 Kanalı Dəyişmək', value: 'Loq kanalını dəyişmək üçün `!setlog #kanal` əmrindən istifadə edin.', inline: false },
            ])
            .setFooter({ text: 'FoxCraft Server Loq Sistemi' })
            .setTimestamp();

        return message.reply({ embeds: [embed] });
    },
};
