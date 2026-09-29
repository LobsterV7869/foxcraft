const { SlashCommandBuilder } = require('discord.js');
const { publicReply, ephemeralReply, getOption } = require('../utils/interaction');
const { foxcraftEmbed } = require('../utils/foxcraft');
const { countWarnings } = require('../utils/db');

const { t } = require('../utils/lang');

function relative(ts, guildId) {
    return ts ? `<t:${Math.floor(ts / 1000)}:R>` : t(guildId, 'common_unknown');
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
        .setDescription('Shows detailed information about a user')
        .addUserOption((option) => option.setName('user').setDescription('Target user').setRequired(false)),
    async execute(interaction) {
        const targetId = getOption(interaction, 'user') || interaction.user?.id || interaction.member?.user?.id;
        const member = await resolveMember(interaction.discordClient, interaction.guild_id, targetId);
        if (!member) return ephemeralReply(t(interaction.guild_id, 'user_not_found'));
        const user = member.user;

        const roles = member.roles.cache
            .filter((role) => role.id !== member.guild.id)
            .sort((a, b) => b.position - a.position)
            .map((role) => role.toString());
        const top10 = roles.slice(0, 10).join(' ') || 'Yoxdur';
        const warnings = countWarnings(member.guild.id, user.id);
        const timedOut = member.communicationDisabledUntil && member.communicationDisabledUntil > Date.now();

        const embed = {
            ...foxcraftEmbed(`👤 ${user.username}`, `Bot: ${user.bot ? '✅ Bəli' : '❌ Xeyr'}`),
            thumbnail: { url: user.displayAvatarURL({ dynamic: true, size: 256 }) },
            fields: [
                { name: t(interaction.guild_id, 'userinfo_id'), value: `\`${user.id}\``, inline: true },
                { name: t(interaction.guild_id, 'log_field_role_name'), value: user.tag, inline: true },
                { name: t(interaction.guild_id, 'userinfo_account'), value: relative(user.createdTimestamp, interaction.guild_id), inline: true },
                { name: t(interaction.guild_id, 'userinfo_joined'), value: relative(member.joinedTimestamp, interaction.guild_id), inline: true },
                { name: t(interaction.guild_id, 'userinfo_nickname'), value: member.nickname || t(interaction.guild_id, 'common_none'), inline: true },
                { name: t(interaction.guild_id, 'userinfo_warnings'), value: String(warnings), inline: true },
                { name: t(interaction.guild_id, 'userinfo_timeout'), value: timedOut ? `<t:${Math.floor(member.communicationDisabledUntil / 1000)}:R>` : 'Yoxdur', inline: true },
                { name: t(interaction.guild_id, 'userinfo_roles'), value: top10, inline: false },
                { name: t(interaction.guild_id, 'userinfo_role_count'), value: String(roles.length), inline: true },
                { name: t(interaction.guild_id, 'userinfo_nitro'), value: member.premiumSinceTimestamp ? `<t:${Math.floor(member.premiumSinceTimestamp / 1000)}:R>` : 'Yoxdur', inline: true },
            ],
        };
        return publicReply(null, [embed]);
    },
    async prefixExecute(message, args) {
        const raw = args[0]?.replace(/[<@!>]/g, '');
        let member = message.member;
        if (raw) {
            member = message.guild.members.cache.get(raw) || await message.guild.members.fetch(raw).catch(() => null);
            if (!member) return message.reply(t(message.guild?.id, 'user_not_found'));
        }
        const user = member.user;
        const roles = member.roles.cache
            .filter((role) => role.id !== member.guild.id)
            .sort((a, b) => b.position - a.position)
            .map((role) => role.toString());
        const warnings = countWarnings(member.guild.id, member.user.id);
        const timedOut = member.communicationDisabledUntil && member.communicationDisabledUntil > Date.now();
        const embed = {
            ...foxcraftEmbed(`👤 ${member.user.username}`, `Bot: ${member.user.bot ? '✅ Bəli' : '❌ Xeyr'}`),
            thumbnail: { url: member.user.displayAvatarURL({ dynamic: true, size: 256 }) },
            fields: [
                { name: t(message.guild?.id, 'userinfo_id'), value: `\`${member.user.id}\``, inline: true },
                { name: t(message.guild?.id, 'userinfo_account'), value: relative(member.user.createdTimestamp, message.guild?.id), inline: true },
                { name: t(message.guild?.id, 'userinfo_joined'), value: relative(member.joinedTimestamp, message.guild?.id), inline: true },
                { name: t(message.guild?.id, 'userinfo_nickname'), value: member.nickname || 'Yoxdur', inline: true },
                { name: t(message.guild?.id, 'userinfo_warnings'), value: String(warnings), inline: true },
                { name: t(message.guild?.id, 'userinfo_timeout'), value: timedOut ? `<t:${Math.floor(member.communicationDisabledUntil / 1000)}:R>` : 'Yoxdur', inline: true },
                { name: t(message.guild?.id, 'userinfo_roles'), value: (roles.slice(0, 10).join(' ') || 'Yoxdur'), inline: false },
            ],
        };
        return message.reply({ embeds: [embed] });
    },
};