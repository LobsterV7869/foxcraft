const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { ephemeralReply, getOption } = require('../utils/interaction');
const { can } = require('../utils/moderation');
const { foxcraftEmbed } = require('../utils/foxcraft');
const qeydiyyat = require('../utils/qeydiyyat');

const { t } = require('../utils/lang');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('qeydiyyat')
        .setDescription('Sets up the registration panel (gives members a role)')
        .addChannelOption((option) => option.setName('kanal')
            .addChannelTypes(ChannelType.GuildText)
            .setDescription('Channel the panel is sent to')
            .setRequired(true))
        .addRoleOption((option) => option.setName('rol').setDescription('Role given after registering').setRequired(true)),
    async execute(interaction) {
        if (!can(interaction.member, PermissionFlagsBits.ManageGuild)) return ephemeralReply(t(interaction.guild_id, 'perm_manage_guild'));
        const channelId = getOption(interaction, 'kanal') || interaction.options?.get('kanal')?.value;
        const roleId = getOption(interaction, 'rol') || interaction.options?.get('rol')?.value;
        if (!channelId || !roleId) return ephemeralReply(t(interaction.guild_id, 'register_no_channel_role'));
        try {
            let channel = interaction.channel;
            if (!channel || String(channel.id) !== String(channelId)) {
                channel = await interaction.discordClient.channels.fetch(channelId).catch(() => null);
            }
            if (!channel?.isTextBased()) return ephemeralReply(t(interaction.guild_id, 'register_bad_channel'));

            qeydiyyat.setup(interaction.guild_id, { channel: String(channelId), role: String(roleId) });

            const embed = {
                ...foxcraftEmbed(t(interaction.guild_id, 'qeydiyyat_title'), t(interaction.guild_id, 'qeydiyyat_intro')),
                fields: [{ name: t(interaction.guild_id, 'opt_panel_role'), value: `<@&${roleId}>`, inline: true }],
            };
            const row = [{ type: 1, components: [{ type: 2, custom_id: 'foxcraft:qeydiyyat-register', label: '🗳️ Qeydiyyatdan keç', style: 1 }] }];
            await channel.send({ embeds: [embed], components: row });
            return ephemeralReply(t(interaction.guild_id, 'register_panel_sent', { channel: (channel) }));
        } catch (error) {
            console.error('[QEydiyyat] Panel göndərilmədi:', error.message);
            return ephemeralReply(t(interaction.guild_id, 'register_panel_failed'));
        }
    },
    async prefixExecute(message, args) {
        if (!can(message.member, PermissionFlagsBits.ManageGuild)) return message.reply(t(message.guild?.id, 'perm_manage_guild'));
        const channel = message.mentions.channels.first();
        const role = message.mentions.roles.first();
        if (!channel?.isTextBased() || !role) return message.reply(t(message.guild?.id, 'usage_register'));
        qeydiyyat.setup(message.guild.id, { channel: channel.id, role: role.id });
        const embed = {
            ...foxcraftEmbed(t(message.guild?.id, 'qeydiyyat_title'), t(message.guild?.id, 'qeydiyyat_intro')),
            fields: [{ name: t(message.guild?.id, 'opt_panel_role'), value: `${role}`, inline: true }],
        };
        await channel.send({ embeds: [embed], components: [{ type: 1, components: [{ type: 2, custom_id: 'foxcraft:qeydiyyat-register', label: '🗳️ Qeydiyyatdan keç', style: 1 }] }] });
        return message.reply(t(message.guild?.id, 'register_panel_sent', { channel: (channel) }));
    },
};