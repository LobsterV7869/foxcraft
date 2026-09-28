const { SlashCommandBuilder, ChannelType } = require('discord.js');
const { publicReply, ephemeralReply } = require('../utils/interaction');
const { foxcraftEmbed } = require('../utils/foxcraft');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('serverinfo')
        .setDescription('Server haqqında ətraflı məlumat göstərir'),
    async execute(interaction) {
        let guild;
        try {
            guild = interaction.guild || await interaction.discordClient.guilds.fetch(interaction.guild_id);
            await guild.fetch();
        } catch {
            return ephemeralReply('Server məlumatları alınmadı.');
        }
        if (!guild) return ephemeralReply('Bu əmr yalnız serverdə istifadə oluna bilər.');

        const channels = await guild.channels.fetch().catch(() => []);
        const channelList = [...channels.values()];
        const textChannels = channelList.filter((c) => c.type === ChannelType.GuildText);
        const voiceChannels = channelList.filter((c) => c.type === ChannelType.GuildVoice);
        const categories = channelList.filter((c) => c.type === ChannelType.GuildCategory);
        const roles = await guild.roles.fetch().catch(() => new Map());
        const emojis = await guild.emojis.fetch().catch(() => new Map());
        const boosts = guild.premiumSubscriptionCount ?? 0;
        let members;
        try {
            members = await guild.members.fetch({ limit: 100 });
        } catch {
            members = guild.members.cache;
        }
        const humans = members.filter((m) => !m.user.bot).size;
        const bots = members.filter((m) => m.user.bot).size;

        const embed = {
            ...foxcraftEmbed(`🏠 ${guild.name}`, guild.description || 'Təsvir yoxdur'),
            thumbnail: guild.iconURL({ dynamic: true, size: 256 }),
            fields: [
                { name: '🆔 Server ID', value: `\`${guild.id}\``, inline: true },
                { name: '👑 Sahib', value: `<@${guild.ownerId}>`, inline: true },
                { name: '📅 Yaradılma', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
                { name: '👥 Üzvlər', value: `${humans} insan • ${bots} bot`, inline: true },
                { name: '💬 Kanallar', value: `📝 ${textChannels.length} • 🎙️ ${voiceChannels.length} • 🗂️ ${categories.length}`, inline: true },
                { name: '🎭 Rollar', value: String(roles.size), inline: true },
                { name: '😀 Emojilər', value: String(emojis.size), inline: true },
                { name: '🚀 Boost səviyyəsi', value: `${guild.premiumTier} (${boosts})`, inline: true },
            ],
        };
        return publicReply(null, [embed]);
    },
    async prefixExecute(message) {
        const guild = message.guild;
        const humans = guild.members.cache.filter((m) => !m.user.bot).size;
        const bots = guild.members.cache.filter((m) => m.user.bot).size;
        const texts = guild.channels.cache.filter((c) => c.type === ChannelType.GuildText).size;
        const voices = guild.channels.cache.filter((c) => c.type === ChannelType.GuildVoice).size;
        const embed = {
            ...foxcraftEmbed(`🏠 ${guild.name}`, guild.description || 'Təsvir yoxdur'),
            thumbnail: guild.iconURL({ dynamic: true, size: 256 }),
            fields: [
                { name: '🆔 Server ID', value: `\`${guild.id}\``, inline: true },
                { name: '👑 Sahib', value: `<@${guild.ownerId}>`, inline: true },
                { name: '📅 Yaradılma', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
                { name: '👥 Üzvlər', value: `${humans} insan • ${bots} bot`, inline: true },
                { name: '💬 Kanallar', value: `📝 ${texts} • 🎙️ ${voices}`, inline: true },
                { name: '🎭 Rollar', value: String(guild.roles.cache.size), inline: true },
                { name: '😀 Emojilər', value: String(guild.emojis.cache.size), inline: true },
            ],
        };
        return message.reply({ embeds: [embed] });
    },
};