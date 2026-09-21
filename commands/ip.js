const { SlashCommandBuilder } = require('discord.js');
const { getServerValues, foxcraftEmbed } = require('../utils/foxcraft');
const { publicReply } = require('../utils/interaction');

module.exports = {
    data: new SlashCommandBuilder().setName('ip').setDescription('FoxCraft server IP və versiyasını göstərir'),
    async execute() {
        const { ip, version } = getServerValues();
        return publicReply(null, [foxcraftEmbed('FoxCraft server məlumatları', `IP: ${ip}\nVersiya: ${version}`)]);
    },
    prefixExecute: async (message) => {
        const { ip, version } = getServerValues();
        return message.reply({ embeds: [foxcraftEmbed('FoxCraft server məlumatları', `IP: ${ip}\nVersiya: ${version}`)] });
    },
};
