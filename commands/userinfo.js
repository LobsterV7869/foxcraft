const { SlashCommandBuilder } = require('discord.js');
const { publicReply, ephemeralReply, getOption } = require('../utils/interaction');
const { foxcraftEmbed } = require('../utils/foxcraft');

function relative(ts) {
    return ts ? `<t:${Math.floor(ts / 1000)}:R>` : 'Naməlum';
}

async function resolveMember(client, guildId, userId) {
    try {
        const guild = await client.guilds.fetch(guildId);
        return await guild.members.fetch(userId).catch(() => null);
    } catch {
        return null;
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('userinfo')
        .setDescription('İstifadəçi haqqında ətraflı məlumat göstərir')
        .addUserOption((option) => option.setName('user').setDescription('Hədəf istifadəçi').setRequired(false)),
    async execute(interaction) {
        const targetId = getOption(interaction, 'user') || interaction.user?.id || interaction.member?.user?.id;
        const member = await resolveMember(interaction.discordClient, interaction.guild_id, targetId);
        if (!member) return ephemeralReply('İstifadəçi tapılmadı.');
        const user = member.user;

        const roles = member.roles.cache
            .filter((role) => role.id !== member.guild.id)
            .sort((a, b) => b.position - a.position)
            .map((role) => role.toString());
        const top10 = roles.slice(0, 10).join(' ') || 'Yoxdur';

        const embed = {
            ...foxcraftEmbed(`👤 ${user.username}`, `Bot: ${user.bot ? '✅ Bəli' : '❌ Xeyr'}`),
            thumbnail: { url: user.displayAvatarURL({ dynamic: true, size: 256 }) },
            fields: [
                { name: '🆔 İstifadəçi ID', value: `\`${user.id}\``, inline: true },
                { name: '🏷️ Etiket', value: user.tag, inline: true },
                { name: '📅 Hesab yaradılma', value: relative(user.createdTimestamp), inline: true },
                { name: '📥 Serverə qoşulma', value: relative(member.joinedTimestamp), inline: true },
                { name: '📛 Ləqəb', value: member.nickname || 'Yoxdur', inline: true },
                { name: '🎨 Rollar', value: top10, inline: false },
                { name: '🗳️ Rollar sayı', value: String(roles.length), inline: true },
                { name: '🕹 Bostan əsaslı', value: member.premiumSinceTimestamp ? `<t:${Math.floor(member.premiumSinceTimestamp / 1000)}:R>` : 'Yoxdur', inline: true },
            ],
        };
        return publicReply(null, [embed]);
    },
    async prefixExecute(message, args) {
        const raw = args[0]?.replace(/[<@!>]/g, '');
        let member = message.member;
        if (raw) {
            member = message.guild.members.cache.get(raw) || await message.guild.members.fetch(raw).catch(() => null);
            if (!member) return message.reply('İstifadəçi tapılmadı.');
        }
        const user = member.user;
        const roles = member.roles.cache
            .filter((role) => role.id !== member.guild.id)
            .sort((a, b) => b.position - a.position)
            .map((role) => role.toString());
        const embed = {
            ...foxcraftEmbed(`👤 ${user.username}`, `Bot: ${user.bot ? '✅ Bəli' : '❌ Xeyr'}`),
            thumbnail: { url: user.displayAvatarURL({ dynamic: true, size: 256 }) },
            fields: [
                { name: '🆔 İstifadəçi ID', value: `\`${user.id}\``, inline: true },
                { name: '📅 Hesab yaradılma', value: relative(user.createdTimestamp), inline: true },
                { name: '📥 Serverə qoşulma', value: relative(member.joinedTimestamp), inline: true },
                { name: '📛 Ləqəb', value: member.nickname || 'Yoxdur', inline: true },
                { name: '🎨 Rollar', value: (roles.slice(0, 10).join(' ') || 'Yoxdur'), inline: false },
            ],
        };
        return message.reply({ embeds: [embed] });
    },
};