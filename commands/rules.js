const { SlashCommandBuilder } = require('discord.js');
const { RULES, foxcraftEmbed } = require('../utils/foxcraft');
const { publicReply } = require('../utils/interaction');

module.exports = {
    data: new SlashCommandBuilder().setName('rules').setDescription('FoxCraft qaydalarını göstərir'),
    async execute() {
        return publicReply(null, [foxcraftEmbed('FoxCraft Qaydaları', RULES)]);
    },
    prefixExecute: async (message) => message.reply({ embeds: [foxcraftEmbed('FoxCraft Qaydaları', RULES)] }),
};
