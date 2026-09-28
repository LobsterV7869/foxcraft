const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { ephemeralReply, getOption } = require('../utils/interaction');
const { can, canActOn, getTarget, logError } = require('../utils/moderation');
const { parseDuration, formatDuration } = require('../utils/duration');
const { logModAction } = require('../utils/modlog');

async function muteTarget(actor, target, durationMs, reason) {
    if (!canActOn(actor, target)) return 'Bu üzvü idarə edə bilməzsən: rol iyerarxiyasını yoxla.';
    if (target.communicationDisabledUntil && target.communicationDisabledUntil > Date.now()) {
        return `${target.user.tag} artıq susdurulub.`;
    }
    await target.timeout(durationMs, reason);
    return null;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Üzvü müəyyən müddətə susdurur')
        .addUserOption((option) => option.setName('user').setDescription('Hədəf üzv').setRequired(true))
        .addStringOption((option) => option.setName('duration').setDescription('Müddət, məs: 1h30m (10m maks 28g)').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('Səbəb').setRequired(false)),
    async execute(interaction) {
        if (!can(interaction.member, PermissionFlagsBits.ModerateMembers)) return ephemeralReply('Bu əmrlə işləmək üçün lazımi icazə yoxdur.');
        const durationMs = parseDuration(getOption(interaction, 'müddət'));
        if (!durationMs) return ephemeralReply('Düzgün müddət yaz: `1s`, `1m`, `1h`, `1d`, `1w` və ya kombinasiya (`1h30m`). Maksimum 28 gün.');
        try {
            const guild = await interaction.discordClient.guilds.fetch(interaction.guild_id);
            const actor = await guild.members.fetch(interaction.user?.id || interaction.member?.user?.id);
            const target = await getTarget(guild, getOption(interaction, 'user'));
            const reason = getOption(interaction, 'reason') || 'Səbəb göstərilməyib.';
            const blocked = await muteTarget(actor, target, durationMs, reason);
            if (blocked) return ephemeralReply(blocked);
            await logModAction(guild, 'mute', `${actor.user.tag} → ${target.user.tag}\nMüddət: ${formatDuration(durationMs)}\nSəbəb: ${reason}`);
            return ephemeralReply(`${target.user.tag} ${formatDuration(durationMs)} müddətinə susduruldu.`);
        } catch (error) {
            logError('/mute', error);
            return ephemeralReply('Mute əməliyyatı həyata keçirilmədi.');
        }
    },
    async prefixExecute(message, args) {
        if (!can(message.member, PermissionFlagsBits.ModerateMembers)) return message.reply('Bu əmrlə işləmək üçün lazımi icazə yoxdur.');
        const targetId = args[0]?.replace(/[<@!>]/g, '');
        const durationMs = parseDuration(args[1]);
        if (!targetId || !durationMs) return message.reply('İstifadə: `!mute @üzv <müddət> [səbəb]` (müddət: 1h30m)');
        const reason = args.slice(2).join(' ') || 'Səbəb göstərilməyib.';
        try {
            const target = await getTarget(message.guild, targetId);
            const blocked = await muteTarget(message.member, target, durationMs, reason);
            if (blocked) return message.reply(blocked);
            await logModAction(message.guild, 'mute', `${message.author.tag} → ${target.user.tag}\nMüddət: ${formatDuration(durationMs)}\nSəbəb: ${reason}`);
            return message.reply(`${target.user.tag} ${formatDuration(durationMs)} müddətinə susduruldu.`);
        } catch (error) {
            logError('!mute', error);
            return message.reply('Mute əməliyyatı həyata keçirilmədi.');
        }
    },
};