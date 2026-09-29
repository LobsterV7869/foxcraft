const { SlashCommandBuilder } = require('discord.js');
const { ephemeralReply } = require('../utils/interaction');
const { foxcraftEmbed, isGuildOwnerOrAdmin } = require('../utils/foxcraft');
const { setupGuild } = require('./setup');

const { t } = require('../utils/lang');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sunucukur')
        .setDescription('Sets up the whole server with one click (channels, roles, panels)'),
    async execute(interaction) {
        if (!interaction.guild_id) return ephemeralReply(t(interaction.guild_id, 'server_only'));
        let guild;
        try {
            guild = await interaction.discordClient.guilds.fetch(interaction.guild_id);
        } catch {
            return ephemeralReply(t(interaction.guild_id, 'guild_load_failed'));
        }
        if (!isGuildOwnerOrAdmin(interaction, await guild.fetch())) {
            return ephemeralReply(t(interaction.guild_id, 'perm_owner_or_admin'));
        }
        const summary = await setupGuild(guild);
        return ephemeralReply(null, [foxcraftEmbed('Sunucu qurulumu', summary.join('\n'))]);
    },
    async prefixExecute(message) {
        const isOwner = message.guild?.ownerId === message.author.id
            || message.member?.permissions.has('Administrator');
        const ownerId = require('../utils/foxcraft').envValue('OWNER_ID');
        if (!isOwner && ownerId !== message.author.id) {
            return message.reply(t(message.guild?.id, 'perm_owner_or_admin'));
        }
        const summary = await setupGuild(message.guild);
        return message.reply({ embeds: [foxcraftEmbed('Sunucu qurulumu', summary.join('\n'))] });
    },
};