const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { ephemeralReply, getOption } = require('../utils/interaction');
const { can, canActOn, getTarget, logError } = require('../utils/moderation');
const { logModAction } = require('../utils/modlog');

const { t } = require('../utils/lang');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('nickname')
        .setDescription('Changes the nickname of a member')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
        .addUserOption((option) => option.setName('user').setDescription('Target member').setRequired(true))
        .addStringOption((option) => option.setName('nickname').setDescription('New nickname (empty to reset it)').setMaxLength(32).setRequired(false)),
    async execute(interaction) {
        if (!can(interaction.member, PermissionFlagsBits.ManageNicknames)) {
            return ephemeralReply(t(interaction.guild_id, 'perm_manage_nicknames'));
        }
        try {
            const guild = await interaction.discordClient.guilds.fetch(interaction.guild_id);
            const actor = await guild.members.fetch(interaction.user?.id || interaction.member?.user?.id);
            const target = await getTarget(guild, getOption(interaction, 'user'));
            if (!canActOn(actor, target)) return ephemeralReply(t(interaction.guild_id, 'cannot_manage_member'));

            const requested = getOption(interaction, 'nickname');
            const nickname = requested ? String(requested).trim() : null;
            if (nickname === '') return ephemeralReply(t(interaction.guild_id, 'nickname_not_empty'));

            const before = target.nickname;
            await target.setNickname(nickname, `${actor.user.tag} via /nickname`);
            const after = target.nickname;
            await logModAction(guild, 'nickname', `${actor.user.tag} -> ${target.user.tag}\nBefore: ${before || '(none)'}\nAfter: ${after || '(none)'}`);
            return ephemeralReply(nickname
                ? `The nickname of ${target.user.tag} is now **${after}**.`
                : `The nickname of ${target.user.tag} was reset.`);
        } catch (error) {
            logError('/nickname', error);
            return ephemeralReply(t(interaction.guild_id, 'nickname_failed'));
        }
    },
    async prefixExecute(message, args) {
        if (!can(message.member, PermissionFlagsBits.ManageNicknames)) {
            return message.reply(t(message.guild?.id, 'perm_manage_nicknames'));
        }
        const targetId = args[0]?.replace(/[<@!>]/g, '');
        if (!targetId) return message.reply(t(message.guild?.id, 'usage_nickname'));
        const nickname = args.slice(1).join(' ').trim() || null;
        try {
            const target = message.guild.members.cache.get(targetId) || await message.guild.members.fetch(targetId).catch(() => null);
            if (!target) return message.reply(t(message.guild?.id, 'user_not_found'));
            if (!canActOn(message.member, target)) return message.reply(t(message.guild?.id, 'cannot_manage_member'));
            const before = target.nickname;
            await target.setNickname(nickname, `${message.author.tag} via !nickname`);
            await logModAction(message.guild, 'nickname', `${message.author.tag} -> ${target.user.tag}\nBefore: ${before || '(none)'}\nAfter: ${target.nickname || '(none)'}`);
            return message.reply(nickname
                ? `The nickname of ${target.user.tag} is now **${target.nickname}**.`
                : `The nickname of ${target.user.tag} was reset.`);
        } catch (error) {
            logError('!nickname', error);
            return message.reply(t(message.guild?.id, 'nickname_failed'));
        }
    },
};
