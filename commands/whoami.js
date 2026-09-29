const { SlashCommandBuilder } = require('discord.js');
const { getMinecraftLink } = require('../utils/storage');
const { getUser, publicReply } = require('../utils/interaction');

function whoamiReply(userId) {
    const username = getMinecraftLink(userId);
    return username
        ? `👤 **Sən:** ${username}\n🎮 **Hesab:** Minecraft hesabın uğurla əlaqələndirilib.`
        : '❌ **Xəta:** Səninlə əlaqələndirilmiş Minecraft istifadəçi adı yoxdur.\n🔗 **Həll:** `!link <minecraft_username>` əmrini istifadə et.';
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('whoami')
        .setDescription('Shows your linked Minecraft username'),
    async execute(interaction) {
        return publicReply(whoamiReply(getUser(interaction).id));
    },
    prefixExecute: async (message) => message.reply(whoamiReply(message.author.id)),
};
