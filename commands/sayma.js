const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { ephemeralReply, getOption } = require('../utils/interaction');
const { updateGuildData, getModules } = require('../utils/db');
const { can } = require('../utils/moderation');

function modify(guildId, fn) {
    const modules = getModules(guildId);
    fn(modules.sayma = modules.sayma || {});
    updateGuildData(guildId, { modules });
    return modules.sayma;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sayma')
        .setDescription('Sayma (rəqəm) sistemi kanalını qurur')
        .addSubcommand((sub) => sub
            .setName('kanal')
            .setDescription('Sayma kanalını təyin et və sistemi aktivləşdir')
            .addChannelOption((option) => option.setName('kanal')
                .addChannelTypes(ChannelType.GuildText)
                .setDescription('Sayma keçiriləcək kanal')
                .setRequired(true)))
        .addSubcommand((sub) => sub
            .setName('sondur')
            .setDescription('Sayma sistemini söndürür')),
    async execute(interaction) {
        const permission = PermissionFlagsBits.ManageChannels;
        if (!can(interaction.member, permission)) return ephemeralReply('Bu əmrlə işləmək üçün Manage Channels icazəsi lazımdır.');
        const sub = interaction.data?.options?.[0]?.name || interaction.options?.getSubcommand?.();
        if (sub === 'kanal') {
            const channelId = getOption(interaction, 'kanal') || interaction.options?.get('kanal')?.value;
            if (!channelId) return ephemeralReply('Kanal seçilmədi.');
            modify(interaction.guild_id, (cfg) => {
                cfg.enabled = true;
                cfg.channel = String(channelId);
            });
            return ephemeralReply(`🔢 Sayma sistemi aktivləşdirildi, kanal: <#${channelId}>\n1-dən başlayaraq ardıcıl sayın; səhv yazan mesaj silinər.`);
        }
        modify(interaction.guild_id, (cfg) => {
            cfg.enabled = false;
        });
        return ephemeralReply('🔢 Sayma sistemi söndürüldü.');
    },
    async prefixExecute(message, args) {
        if (!can(message.member, PermissionFlagsBits.ManageChannels)) return message.reply('Bu əmrlə işləmək üçün Manage Channels icazəsi lazımdır.');
        const sub = args[0]?.toLowerCase();
        if (sub === 'sondur') {
            modify(message.guild.id, (cfg) => { cfg.enabled = false; });
            return message.reply('🔢 Sayma sistemi söndürüldü.');
        }
        const channel = message.mentions.channels.first() || message.guild.channels.cache.get(args[0]?.replace(/[<#>]/g, ''));
        if (!channel?.isTextBased()) return message.reply('İstifadə: `!sayma qur #kanal` və ya `!sayma söndür`');
        modify(message.guild.id, (cfg) => {
            cfg.enabled = true;
            cfg.channel = channel.id;
        });
        return message.reply(`🔢 Sayma sistemi aktivləşdirildi, kanal: ${channel}`);
    },
};