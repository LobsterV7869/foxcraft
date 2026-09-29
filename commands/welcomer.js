const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { ephemeralReply, getOption } = require('../utils/interaction');
const { can } = require('../utils/moderation');
const { updateGuildData, getModules } = require('../utils/db');

const { t } = require('../utils/lang');

function modify(guildId, fn) {
    const modules = getModules(guildId);
    fn(modules.welcomer = modules.welcomer || {});
    updateGuildData(guildId, { modules });
    return modules.welcomer;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('welcomer')
        .setDescription('Sets up the welcome/leave message system')
        .addSubcommand((sub) => sub
            .setName('qur')
            .setDescription('Set the welcomer channel, role and message')
            .addChannelOption((option) => option.setName('kanal')
                .addChannelTypes(ChannelType.GuildText)
                .setDescription('Welcome message channel')
                .setRequired(true))
            .addChannelOption((option) => option.setName('leave')
                .addChannelTypes(ChannelType.GuildText)
                .setDescription('Leave message channel'))
            .addRoleOption((option) => option.setName('rol').setDescription('Role given automatically'))
            .addStringOption((option) => option.setName('mesaj').setDescription('Welcome message ({user} {username} {server} {membercount})').setMaxLength(1000))
            .addBooleanOption((option) => option.setName('dm').setDescription('Also send a direct message')))
        .addSubcommand((sub) => sub
            .setName('sondur')
            .setDescription('Disables the welcomer system')),
    async execute(interaction) {
        if (!can(interaction.member, PermissionFlagsBits.ManageGuild)) return ephemeralReply(t(interaction.guild_id, 'perm_manage_guild'));
        const sub = interaction.data?.options?.[0]?.name || interaction.options?.getSubcommand?.();
        if (sub === 'sondur') {
            modify(interaction.guild_id, (cfg) => { cfg.enabled = false; });
            return ephemeralReply(t(interaction.guild_id, 'welcomer_disabled'));
        }
        const channel = getOption(interaction, 'kanal') || interaction.options?.get('kanal')?.value;
        if (!channel) return ephemeralReply(t(interaction.guild_id, 'welcomer_no_channel_select'));
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
        return ephemeralReply(t(interaction.guild_id, 'welcomer_enabled', { channel: `<#${cfg.channel}>`, role: cfg.autoRole ? t(interaction.guild_id, 'welcomer_autorole', { role: `<@&${cfg.autoRole}>` }) : '' }));
    },
    async prefixExecute(message, args) {
        if (!can(message.member, PermissionFlagsBits.ManageGuild)) return message.reply(t(message.guild?.id, 'perm_manage_guild'));
        const sub = args[0]?.toLowerCase();
        if (sub === 'sondur') {
            modify(message.guild.id, (cfg) => { cfg.enabled = false; });
            return message.reply(t(message.guild?.id, 'welcomer_disabled'));
        }
        const channel = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]?.replace(/[<#>]/g, ''));
        if (!channel?.isTextBased()) return message.reply(t(message.guild?.id, 'usage_welcomer'));
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
        return message.reply(t(message.guild?.id, 'welcomer_enabled', { channel, role: cfg.autoRole ? t(message.guild?.id, 'welcomer_autorole', { role: `<@&${cfg.autoRole}>` }) : '' }));
    },
};