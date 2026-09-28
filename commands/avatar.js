const { SlashCommandBuilder } = require('discord.js');
const { publicReply, ephemeralReply, getOption } = require('../utils/interaction');
const { foxcraftEmbed } = require('../utils/foxcraft');

function avatarEmbed(user, member) {
    const avatars = member?.displayAvatarURL?.({ size: 1024, dynamic: true })
        || user.displayAvatarURL({ size: 1024, dynamic: true });
    const staticUrl = user.displayAvatarURL({ size: 1024, extension: 'png' });
    const gifUrl = user.avatar?.startsWith('a_')
        ? user.displayAvatarURL({ size: 1024, extension: 'gif' })
        : staticUrl;
    return {
        ...foxcraftEmbed(`🖼️ ${user.tag}`, 'Avatar səhifəsi'),
        image: { url: avatars },
        color: 0x57F287,
        fields: [
            { name: '🖼 PNG', value: `[Link](${staticUrl})`, inline: true },
            { name: '🎞 GIF', value: `[Link](${gifUrl})`, inline: true },
        ],
        thumbnail: { url: user.displayAvatarURL({ size: 64 }) },
    };
}

async function resolveUser(client, guild, userId) {
    if (!userId) return null;
    const member = await guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
    return { user: member?.user || await client.users.fetch(userId).catch(() => null), member };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('avatar')
        .setDescription('İstifadəçinin avatarını göstərir')
        .addUserOption((option) => option.setName('user').setDescription('Hədəf istifadəçi').setRequired(false)),
    async execute(interaction) {
        const targetId = getOption(interaction, 'user') || interaction.user?.id || interaction.member?.user?.id;
        const target = await resolveUser(interaction.discordClient, await interaction.discordClient.guilds.fetch(interaction.guild_id), targetId);
        if (!target?.user) return ephemeralReply('İstifadəçi tapılmadı.');
        return publicReply(null, [avatarEmbed(target.user, target.member)]);
    },
    async prefixExecute(message, args) {
        const raw = args[0]?.replace(/[<@!>]/g, '');
        let member = message.member;
        let user = message.author;
        if (raw) {
            member = message.guild.members.cache.get(raw) || await message.guild.members.fetch(raw).catch(() => null);
            user = member?.user || null;
            if (!user) user = await message.client.users.fetch(raw).catch(() => null);
            if (!user) return message.reply('İstifadəçi tapılmadı.');
        }
        return message.reply({ embeds: [avatarEmbed(user, member)] });
    },
};