const { SlashCommandBuilder } = require('discord.js');
const { getServerValues, foxcraftEmbed } = require('../utils/foxcraft');
const { publicReply } = require('../utils/interaction');
const { t } = require('../utils/lang');

module.exports = {
    data: new SlashCommandBuilder().setName('ip').setDescription('Shows the FoxCraft server IP and version'),
    async execute() {
        const { ip, version } = getServerValues();
        return publicReply(null, [foxcraftEmbed(t(interaction.guild_id, 'ip_title'), `IP: ${ip}\n${t(interaction.guild_id, 'foxcraft_version')}: ${version}`)]);
    },
    prefixExecute: async (message) => {
        const { ip, version } = getServerValues();
        return message.reply({ embeds: [foxcraftEmbed(t(message.guild?.id, 'ip_title'), `IP: ${ip}\n${t(message.guild?.id, 'foxcraft_version')}: ${version}`)] });
    },
};
