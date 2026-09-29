const { SlashCommandBuilder } = require('discord.js');
const { getMinecraftLink, setMinecraftLink } = require('../utils/storage');
const { ephemeralReply, getOption, getUser, publicReply } = require('../utils/interaction');

const { t } = require('../utils/lang');

function cleanUsername(username) {
    return String(username || '').trim();
}

function linkReply(username) {
    return `Your Minecraft username **${username}** has been saved.`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('link')
        .setDescription('Links your Discord account to a Minecraft username')
        .addStringOption((option) => option
            .setName('minecraft_username')
            .setDescription('Minecraft username')
            .setRequired(true)),
    async execute(interaction) {
        const username = cleanUsername(getOption(interaction, 'minecraft_username'));
        if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) {
            return ephemeralReply(t(interaction.guild_id, 'mc_username_invalid'));
        }
        setMinecraftLink(getUser(interaction).id, username);
        return ephemeralReply(linkReply(username));
    },
    prefixExecute: async (message, args) => {
        const username = cleanUsername(args[0]);
        if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) {
            return message.reply(t(message.guild?.id, 'link_usage'));
        }
        setMinecraftLink(message.author.id, username);
        return message.reply(linkReply(username));
    },
};
