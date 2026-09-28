const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { ephemeralReply, getOption } = require('../utils/interaction');
const { can } = require('../utils/moderation');
const { updateGuildData, getModules } = require('../utils/db');

function modify(guildId, fn) {
    const modules = getModules(guildId);
    fn(modules.welcomer = modules.welcomer || {});
    updateGuildData(guildId, { modules });
    return modules.welcomer;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('welcomer')
        .setDescription('Xoş gəldin/çıxış mesajı sistemini qurur')
        .addSubcommand((sub) => sub
            .setName('qur')
            .setDescription('Welcomer kanalı, rolu və mesajını təyin et')
            .addChannelOption((option) => option.setName('kanal')
                .addChannelTypes(ChannelType.GuildText)
                .setDescription('Xoş gəldin mesajı kanalı')
                .setRequired(true))
            .addChannelOption((option) => option.setName('leave')
                .addChannelTypes(ChannelType.GuildText)
                .setDescription('Çıxış mesajı kanalı'))
            .addRoleOption((option) => option.setName('rol').setDescription('Avtomatik veriləcək rol'))
            .addStringOption((option) => option.setName('mesaj').setDescription('Xoş gəldin mesajı ({user} {username} {server} {membercount})').setMaxLength(1000))
            .addBooleanOption((option) => option.setName('dm').setDescription('Şəxsi mesaj da göndərilsin')))
        .addSubcommand((sub) => sub
            .setName('sondur')
            .setDescription('Welcomer sistemini söndürür')),
    async execute(interaction) {
        if (!can(interaction.member, PermissionFlagsBits.ManageGuild)) return ephemeralReply('Bu əmrlə işləmək üçün Manage Guild icazəsi lazımdır.');
        const sub = interaction.data?.options?.[0]?.name || interaction.options?.getSubcommand?.();
        if (sub === 'sondur') {
            modify(interaction.guild_id, (cfg) => { cfg.enabled = false; });
            return ephemeralReply('👋 Welcomer söndürüldü.');
        }
        const channel = getOption(interaction, 'kanal') || interaction.options?.get('kanal')?.value;
        if (!channel) return ephemeralReply('Kanal seçilmədi.');
        const leaveChannel = getOption(interaction, 'leave') || interaction.options?.get('leave')?.value;
        const role = getOption(interaction, 'rol') || interaction.options?.get('rol')?.value;
        const messageText = getOption(interaction, 'mesaj') || interaction.options?.get('mesaj')?.value;
        const dm = getOption(interaction, 'dm');
        const cfg = modify(interaction.guild_id, (c) => {
            c.enabled = true;
            c.channel = String(channel);
            if (leaveChannel) c.leaveChannel = String(leaveChannel);
            if (role) c.autoRole = String(role);
            if (messageText) c.message = String(messageText);
            if (typeof dm === 'boolean') c.dm = dm;
        });
        return ephemeralReply(`👋 Welcomer aktivləşdirildi (kanal: <#${cfg.channel}>${cfg.autoRole ? `, avto-rol: <@&${cfg.autoRole}>` : ''}).`);
    },
    async prefixExecute(message, args) {
        if (!can(message.member, PermissionFlagsBits.ManageGuild)) return message.reply('Bu əmrlə işləmək üçün Manage Guild icazəsi lazımdır.');
        const sub = args[0]?.toLowerCase();
        if (sub === 'sondur') {
            modify(message.guild.id, (cfg) => { cfg.enabled = false; });
            return message.reply('👋 Welcomer söndürüldü.');
        }
        const channel = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]?.replace(/[<#>]/g, ''));
        if (!channel?.isTextBased()) return message.reply('İstifadə: `!welcomer qur #kanal [rol] [mesaj]` və ya `!welcomer söndür`');
        const role = message.mentions.roles.first()?.id || '';
        const rest = (channel.id === args[1]?.replace(/[<#>]/g, '') ? args.slice(2) : args.slice(1)).join(' ');
        const rolesLeft = message.mentions.roles.first() ? rest.split(' ').slice(1).join(' ') : rest;
        const messageText = message.mentions.roles.first() ? rolesLeft || undefined : rest || undefined;
        const cfg = modify(message.guild.id, (c) => {
            c.enabled = true;
            c.channel = channel.id;
            if (role) c.autoRole = role;
            if (messageText) c.message = messageText;
        });
        return message.reply(`👋 Welcomer aktivləşdirildi (kanal: ${channel}${cfg.autoRole ? `, avto-rol: <@&${cfg.autoRole}>` : ''}).`);
    },
};