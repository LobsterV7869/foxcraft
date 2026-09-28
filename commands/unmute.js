const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { ephemeralReply, getOption } = require('../utils/interaction');
const { can, canActOn, getTarget, logError } = require('../utils/moderation');
const { logModAction } = require('../utils/modlog');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unmute')
        .setDescription('Üzvün səssizliyini (timeout) aradan qaldırır')
        .addUserOption((option) => option.setName('user').setDescription('Hədəf üzv').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('Səbəb').setRequired(false)),
    async execute(interaction) {
        if (!can(interaction.member, PermissionFlagsBits.ModerateMembers)) return ephemeralReply('Bu əmrlə işləmək üçün lazımi icazə yoxdur.');
        try {
            const guild = await interaction.discordClient.guilds.fetch(interaction.guild_id);
            const actor = await guild.members.fetch(interaction.user?.id || interaction.member?.user?.id);
            const target = await getTarget(guild, getOption(interaction, 'user'));
            if (!canActOn(actor, target)) return ephemeralReply('Bu üzvü idarə edə bilməzsən: rol iyerarxiyasını yoxla.');
            if (!target.communicationDisabledUntil || target.communicationDisabledUntil <= Date.now()) {
                return ephemeralReply(`${target.user.tag} susdurulmayıb.`);
            }
            await target.timeout(null);
            const reason = getOption(interaction, 'reason') || 'Səbəb göstərilməyib.';
            await logModAction(guild, 'unmute', `${actor.user.tag} → ${target.user.tag}\nSəbəb: ${reason}`);
            return ephemeralReply(`${target.user.tag} səssizliyi qaldırıldı.`);
        } catch (error) {
            logError('/unmute', error);
            return ephemeralReply('Unmute əməliyyatı həyata keçirilmədi.');
        }
    },
    async prefixExecute(message, args) {
        if (!can(message.member, PermissionFlagsBits.ModerateMembers)) return message.reply('Bu əmrlə işləmək üçün lazımi icazə yoxdur.');
        const targetId = args[0]?.replace(/[<@!>]/g, '');
        if (!targetId) return message.reply('İstifadə: `!unmute @üzv [səbəb]`');
        const reason = args.slice(1).join(' ') || 'Səbəb göstərilməyib.';
        try {
            const target = await getTarget(message.guild, targetId);
            if (!canActOn(message.member, target)) return message.reply('Bu üzvü idarə edə bilməzsən: rol iyerarxiyasını yoxla.');
            if (!target.communicationDisabledUntil || target.communicationDisabledUntil <= Date.now()) {
                return message.reply(`${target.user.tag} susdurulmayıb.`);
            }
            await target.timeout(null);
            await logModAction(message.guild, 'unmute', `${message.author.tag} → ${target.user.tag}\nSəbəb: ${reason}`);
            return message.reply(`${target.user.tag} səssizliyi qaldırıldı.`);
        } catch (error) {
            logError('!unmute', error);
            return message.reply('Unmute əməliyyatı həyata keçirilmədi.');
        }
    },
};