const { SlashCommandBuilder } = require('discord.js');
const { ephemeralReply } = require('../utils/interaction');
const { foxcraftEmbed, isGuildOwnerOrAdmin } = require('../utils/foxcraft');
const { setupGuild } = require('./setup');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sunucukur')
        .setDescription('Serveri bir düymə ilə tam qurur (kanallar, rollar, panellər)'),
    async execute(interaction) {
        if (!interaction.guild_id) return ephemeralReply('Bu əmr yalnız serverdə istifadə oluna bilər.');
        let guild;
        try {
            guild = await interaction.discordClient.guilds.fetch(interaction.guild_id);
        } catch {
            return ephemeralReply('Server məlumatları alınmadı.');
        }
        if (!isGuildOwnerOrAdmin(interaction, await guild.fetch())) {
            return ephemeralReply('Bu əmrdən yalnız server sahibi, administrator və ya OWNER_ID istifadə edə bilər.');
        }
        const summary = await setupGuild(guild);
        return ephemeralReply(null, [foxcraftEmbed('Sunucu qurulumu', summary.join('\n'))]);
    },
    async prefixExecute(message) {
        const isOwner = message.guild?.ownerId === message.author.id
            || message.member?.permissions.has('Administrator');
        const ownerId = require('../utils/foxcraft').envValue('OWNER_ID');
        if (!isOwner && ownerId !== message.author.id) {
            return message.reply('Bu əmrdən yalnız server sahibi, administrator və ya OWNER_ID istifadə edə bilər.');
        }
        const summary = await setupGuild(message.guild);
        return message.reply({ embeds: [foxcraftEmbed('Sunucu qurulumu', summary.join('\n'))] });
    },
};