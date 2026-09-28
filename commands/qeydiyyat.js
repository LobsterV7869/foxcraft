const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { ephemeralReply, getOption } = require('../utils/interaction');
const { can } = require('../utils/moderation');
const { foxcraftEmbed } = require('../utils/foxcraft');
const qeydiyyat = require('../utils/qeydiyyat');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('qeydiyyat')
        .setDescription('Qeydiyyat panelini qurur (üzvə rol verir)')
        .addChannelOption((option) => option.setName('kanal')
            .addChannelTypes(ChannelType.GuildText)
            .setDescription('Panelin göndəriləcəyi kanal')
            .setRequired(true))
        .addRoleOption((option) => option.setName('rol').setDescription('Qeydiyyatdan keçənə veriləcək rol').setRequired(true)),
    async execute(interaction) {
        if (!can(interaction.member, PermissionFlagsBits.ManageGuild)) return ephemeralReply('Bu əmrlə işləmək üçün Manage Guild icazəsi lazımdır.');
        const channelId = getOption(interaction, 'kanal') || interaction.options?.get('kanal')?.value;
        const roleId = getOption(interaction, 'rol') || interaction.options?.get('rol')?.value;
        if (!channelId || !roleId) return ephemeralReply('Kanal və rol seçilmədi.');
        try {
            let channel = interaction.channel;
            if (!channel || String(channel.id) !== String(channelId)) {
                channel = await interaction.discordClient.channels.fetch(channelId).catch(() => null);
            }
            if (!channel?.isTextBased()) return ephemeralReply('Seçilən kanal uyğun deyil.');

            qeydiyyat.setup(interaction.guild_id, { channel: String(channelId), role: String(roleId) });

            const embed = {
                ...foxcraftEmbed('🗳️ Qeydiyyat', 'Aşağıdakı düyməyə basaraq qeydiyyatdan keç və rolunu al.'),
                fields: [{ name: 'Rol', value: `<@&${roleId}>`, inline: true }],
            };
            const row = [{ type: 1, components: [{ type: 2, custom_id: 'foxcraft:qeydiyyat-register', label: '🗳️ Qeydiyyatdan keç', style: 1 }] }];
            await channel.send({ embeds: [embed], components: row });
            return ephemeralReply(`🗳️ Qeydiyyat paneli ${channel} kanalına göndərildi.`);
        } catch (error) {
            console.error('[QEydiyyat] Panel göndərilmədi:', error.message);
            return ephemeralReply('Panel göndərilmədi.');
        }
    },
    async prefixExecute(message, args) {
        if (!can(message.member, PermissionFlagsBits.ManageGuild)) return message.reply('Bu əmrlə işləmək üçün Manage Guild icazəsi lazımdır.');
        const channel = message.mentions.channels.first();
        const role = message.mentions.roles.first();
        if (!channel?.isTextBased() || !role) return message.reply('İstifadə: `!qeydiyyat #kanal @rol`');
        qeydiyyat.setup(message.guild.id, { channel: channel.id, role: role.id });
        const embed = {
            ...foxcraftEmbed('🗳️ Qeydiyyat', 'Aşağıdakı düyməyə basaraq qeydiyyatdan keç və rolunu al.'),
            fields: [{ name: 'Rol', value: `${role}`, inline: true }],
        };
        await channel.send({ embeds: [embed], components: [{ type: 1, components: [{ type: 2, custom_id: 'foxcraft:qeydiyyat-register', label: '🗳️ Qeydiyyatdan keç', style: 1 }] }] });
        return message.reply(`🗳️ Qeydiyyat paneli ${channel} kanalına göndərildi.`);
    },
};