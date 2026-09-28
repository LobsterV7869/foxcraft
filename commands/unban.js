const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { ephemeralReply, getOption } = require('../utils/interaction');
const { can, logError } = require('../utils/moderation');
const { logModAction } = require('../utils/modlog');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unban')
        .setDescription('Banlanmış üzvün banını qaldırır')
        .addUserOption((option) => option.setName('user').setDescription('Hədəf istifadəçi').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('Səbəb').setRequired(false)),
    async execute(interaction) {
        if (!can(interaction.member, PermissionFlagsBits.BanMembers)) return ephemeralReply('Bu əmrlə işləmək üçün Ban Members icazəsi lazımdır.');
        try {
            const guild = await interaction.discordClient.guilds.fetch(interaction.guild_id);
            const actor = await guild.members.fetch(interaction.user?.id || interaction.member?.user?.id);
            const bannedId = getOption(interaction, 'user');
            const banned = await guild.bans.fetch(bannedId).catch(() => null);
            if (!banned) return ephemeralReply('Bu istifadəçi banlanmayıb.');
            const reason = getOption(interaction, 'reason') || 'Səbəb göstərilməyib.';
            await guild.bans.remove(bannedId, reason);
            await logModAction(guild, 'unban', `${actor.user.tag} → ${banned.user.tag}\nSəbəb: ${reason}`);
            return ephemeralReply(`${banned.user.tag} banı qaldırıldı.`);
        } catch (error) {
            logError('/unban', error);
            return ephemeralReply('Unban əməliyyatı həyata keçirilmədi.');
        }
    },
    async prefixExecute(message, args) {
        if (!can(message.member, PermissionFlagsBits.BanMembers)) return message.reply('Bu əmrlə işləmək üçün Ban Members icazəsi lazımdır.');
        const targetId = args[0]?.replace(/[<@!>]/g, '');
        if (!targetId) return message.reply('İstifadə: `!unban <istifadəçi_id> [səbəb]`');
        const reason = args.slice(1).join(' ') || 'Səbəb göstərilməyib.';
        try {
            const banned = await message.guild.bans.fetch(targetId).catch(() => null);
            if (!banned) return message.reply('Bu istifadəçi banlanmayıb.');
            await message.guild.bans.remove(targetId, reason);
            await logModAction(message.guild, 'unban', `${message.author.tag} → ${banned.user.tag}\nSəbəb: ${reason}`);
            return message.reply(`${banned.user.tag} banı qaldırıldı.`);
        } catch (error) {
            logError('!unban', error);
            return message.reply('Unban əməliyyatı həyata keçirilmədi.');
        }
    },
};