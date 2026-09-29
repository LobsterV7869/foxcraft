const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { ephemeralReply, getOption } = require('../utils/interaction');
const { updateGuildData, getModules } = require('../utils/db');
const { can } = require('../utils/moderation');

const { t } = require('../utils/lang');

function modify(guildId, fn) {
    const modules = getModules(guildId);
    fn(modules.sayma = modules.sayma || {});
    updateGuildData(guildId, { modules });
    return modules.sayma;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sayma')
        .setDescription('Sets up the counting channel')
        .addSubcommand((sub) => sub
            .setName('kanal')
            .setDescription('Set the counting channel and enable the system')
            .addChannelOption((option) => option.setName('kanal')
                .addChannelTypes(ChannelType.GuildText)
                .setDescription('Counting channel')
                .setRequired(true)))
        .addSubcommand((sub) => sub
            .setName('sondur')
            .setDescription('Disables the counting system')),
    async execute(interaction) {
        const permission = PermissionFlagsBits.ManageChannels;
        if (!can(interaction.member, permission)) return ephemeralReply(t(interaction.guild_id, 'perm_manage_channels'));
        const sub = interaction.data?.options?.[0]?.name || interaction.options?.getSubcommand?.();
        if (sub === 'kanal') {
            const channelId = getOption(interaction, 'kanal') || interaction.options?.get('kanal')?.value;
            if (!channelId) return ephemeralReply(t(interaction.guild_id, 'counting_no_channel'));
            modify(interaction.guild_id, (cfg) => {
                cfg.enabled = true;
                cfg.channel = String(channelId);
            });
            return ephemeralReply(t(interaction.guild_id, 'counting_announce', { channel: `<#${channelId}>` }));
        }
        modify(interaction.guild_id, (cfg) => {
            cfg.enabled = false;
        });
        return ephemeralReply(t(interaction.guild_id, 'counting_disabled'));
    },
    async prefixExecute(message, args) {
        if (!can(message.member, PermissionFlagsBits.ManageChannels)) return message.reply(t(message.guild?.id, 'perm_manage_channels'));
        const sub = args[0]?.toLowerCase();
        if (sub === 'sondur') {
            modify(message.guild.id, (cfg) => { cfg.enabled = false; });
            return message.reply(t(message.guild?.id, 'counting_disabled'));
        }
        const channel = message.mentions.channels.first() || message.guild.channels.cache.get(args[0]?.replace(/[<#>]/g, ''));
        if (!channel?.isTextBased()) return message.reply(t(message.guild?.id, 'usage_counting'));
        modify(message.guild.id, (cfg) => {
            cfg.enabled = true;
            cfg.channel = channel.id;
        });
        return message.reply(t(message.guild?.id, 'counting_enabled', { channel: `${channel}` }));
    },
};