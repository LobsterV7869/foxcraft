const { SlashCommandBuilder } = require('discord.js');
const { publicReply, ephemeralReply, getOption } = require('../utils/interaction');

const { t } = require('../utils/lang');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('qrkod')
        .setDescription('Creates a QR code from the given text')
        .addStringOption((option) => option.setName('text').setDescription('Text to turn into a QR code').setMaxLength(500).setRequired(true)),
    async execute(interaction) {
        const text = getOption(interaction, 'text') || '';
        if (!text.trim()) return ephemeralReply(t(interaction.guild_id, 'qr_no_text'));
        const url = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&qzone=2&margin=10&data=${encodeURIComponent(text)}`;
        return publicReply(null, [{
            title: '📱 QR Kod',
            description: `\`${text.slice(0, 100)}\``,
            color: 0x57F287,
            image: { url },
            url,
            footer: { text: 'FoxCraft | QR kod' },
        }]);
    },
    async prefixExecute(message, args) {
        const text = args.join(' ');
        if (!text) return message.reply(t(message.guild?.id, 'qrkod_usage'));
        const url = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&qzone=2&margin=10&data=${encodeURIComponent(text)}`;
        return message.reply({ embeds: [{
            title: '📱 QR Kod',
            description: `\`${text.slice(0, 100)}\``,
            color: 0x57F287,
            image: { url },
            url,
        }] });
    },
};