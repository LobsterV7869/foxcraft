const { SlashCommandBuilder } = require('discord.js');
const { getMinecraftLink, setMinecraftLink } = require('../utils/storage');
const { ephemeralReply, getOption, getUser, publicReply } = require('../utils/interaction');

function cleanUsername(username) {
    return String(username || '').trim();
}

function linkReply(username) {
    return `Minecraft istifadəçi adın **${username}** olaraq yadda saxlanıldı.`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('link')
        .setDescription('Discord hesabını Minecraft istifadəçi adı ilə əlaqələndirir')
        .addStringOption((option) => option
            .setName('minecraft_username')
            .setDescription('Minecraft istifadəçi adı')
            .setRequired(true)),
    async execute(interaction) {
        const username = cleanUsername(getOption(interaction, 'minecraft_username'));
        if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) {
            return ephemeralReply('Minecraft istifadəçi adı 3-16 simvol olmalı və yalnız hərf, rəqəm, alt xəttdən ibarət olmalıdır.');
        }
        setMinecraftLink(getUser(interaction).id, username);
        return ephemeralReply(linkReply(username));
    },
    prefixExecute: async (message, args) => {
        const username = cleanUsername(args[0]);
        if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) {
            return message.reply('İstifadə: `!link <minecraft_username>`');
        }
        setMinecraftLink(message.author.id, username);
        return message.reply(linkReply(username));
    },
};
