const { SlashCommandBuilder, ChannelType } = require('discord.js');
const { publicReply, ephemeralReply } = require('../utils/interaction');
const { foxcraftEmbed } = require('../utils/foxcraft');

const { t } = require('../utils/lang');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('serverinfo')
        .setDescription('Shows detailed information about the server'),
    async execute(interaction) {
        let guild;
        try {
            guild = interaction.guild || await interaction.discordClient.guilds.fetch(interaction.guild_id);
            await guild.fetch();
        } catch {
            return ephemeralReply(t(interaction.guild_id, 'guild_load_failed'));
        }
        if (!guild) return ephemeralReply(t(interaction.guild_id, 'server_only'));

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
                { name: t(interaction.guild_id, 'serverinfo_id'), value: `\`${guild.id}\``, inline: true },
                { name: t(interaction.guild_id, 'serverinfo_owner'), value: `<@${guild.ownerId}>`, inline: true },
                { name: t(interaction.guild_id, 'serverinfo_created'), value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
                { name: t(interaction.guild_id, 'serverinfo_members'), value: `${humans} insan • ${bots} bot`, inline: true },
                { name: t(interaction.guild_id, 'serverinfo_channels'), value: `📝 ${textChannels.length} • 🎙️ ${voiceChannels.length} • 🗂️ ${categories.length}`, inline: true },
                { name: t(interaction.guild_id, 'serverinfo_roles'), value: String(roles.size), inline: true },
                { name: t(interaction.guild_id, 'serverinfo_emojis'), value: String(emojis.size), inline: true },
                { name: t(interaction.guild_id, 'serverinfo_boost'), value: `${guild.premiumTier} (${boosts})`, inline: true },
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
                { name: t(message.guild?.id, 'serverinfo_id'), value: `\`${guild.id}\``, inline: true },
                { name: t(message.guild?.id, 'serverinfo_owner'), value: `<@${guild.ownerId}>`, inline: true },
                { name: t(message.guild?.id, 'serverinfo_created'), value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
                { name: t(message.guild?.id, 'serverinfo_members'), value: `${humans} insan • ${bots} bot`, inline: true },
                { name: t(message.guild?.id, 'serverinfo_channels'), value: `📝 ${texts} • 🎙️ ${voices}`, inline: true },
                { name: t(message.guild?.id, 'serverinfo_roles'), value: String(guild.roles.cache.size), inline: true },
                { name: t(message.guild?.id, 'serverinfo_emojis'), value: String(guild.emojis.cache.size), inline: true },
            ],
        };
        return message.reply({ embeds: [embed] });
    },
};