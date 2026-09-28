const { SlashCommandBuilder } = require('discord.js');
const { ephemeralReply, getOption } = require('../utils/interaction');
const { setAfk, clearAfk } = require('../utils/db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('afk')
        .setDescription('AFK (uzaqda) vəziyyətini aktivləşdirir / söndürür')
        .addStringOption((option) => option.setName('sebeb').setDescription('AFK səbəbi').setMaxLength(200).setRequired(false)),
    async execute(interaction) {
        const userId = interaction.user?.id || interaction.member?.user?.id;
        const reason = getOption(interaction, 'sebeb') || 'Səbəb göstərilməyib.';
        setAfk(interaction.guild_id, userId, reason);
        return ephemeralReply(`✅ AFK vəziyyətinə keçdin: *${reason}*\nYazdığın zaman avtomatik silinəcək.`);
    },
    async prefixExecute(message, args) {
        const reason = args.join(' ') || 'Səbəb göstərilməyib.';
        setAfk(message.guild.id, message.author.id, reason);
        return message.reply(`✅ AFK vəziyyətinə keçdin: *${reason}*\nYazdığın zaman avtomatik silinəcək.`);
    },
};