const { SlashCommandBuilder } = require('discord.js');
const { RULES, foxcraftEmbed } = require('../utils/foxcraft');
const { publicReply } = require('../utils/interaction');

const { t } = require('../utils/lang');

module.exports = {
    data: new SlashCommandBuilder().setName('rules').setDescription('Shows the FoxCraft rules'),
    async execute(interaction) {
        return publicReply(null, [foxcraftEmbed(t(interaction.guild_id, 'rules_title'), RULES)]);
    },
    prefixExecute: async (message) => message.reply({ embeds: [foxcraftEmbed(t(message.guild?.id, 'rules_title'), RULES)] }),
};
