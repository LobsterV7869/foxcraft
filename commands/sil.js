const { SlashCommandBuilder } = require('discord.js');
const { ephemeralReply, getOption } = require('../utils/interaction');
const { PermissionFlagsBits, can, logError } = require('../utils/moderation');
const { logModAction } = require('../utils/modlog');

async function clearMessages(channel, count) {
    const messages = await channel.messages.fetch({ limit: Math.min(count, 100) });
    const deletable = messages.filter((message) => Date.now() - message.createdTimestamp < 14 * 24 * 60 * 60 * 1000);
    if (deletable.size) await channel.bulkDelete(deletable, true);
    return deletable.size;
}

module.exports = {
    data: new SlashCommandBuilder().setName('sil').setDescription('Kanalda son mesajları silir')
        .addIntegerOption((option) => option.setName('say').setDescription('1-100 arası mesaj sayı').setMinValue(1).setMaxValue(100).setRequired(true)),
    async execute(interaction) {
        if (!can(interaction.member, PermissionFlagsBits.ManageMessages)) return ephemeralReply('Bu əmrlə işləmək üçün Manage Messages icazəsi lazımdır.');
        try {
            const count = getOption(interaction, 'say');
            const deleted = await clearMessages(interaction.channel, count);
            const guild = await interaction.discordClient.guilds.fetch(interaction.guild_id);
            const actor = await guild.members.fetch(interaction.user?.id || interaction.member?.user?.id);
            await logModAction(guild, 'sil', `${actor.user.tag} → #${interaction.channel?.name || interaction.channel_id}: ${deleted} mesaj silindi.`);
            return ephemeralReply(`${deleted} mesaj silindi.`);
        } catch (error) {
            logError('/sil', error);
            return ephemeralReply('Mesajlar silinə bilmədi.');
        }
    },
    async prefixExecute(message, args) {
        if (!can(message.member, PermissionFlagsBits.ManageMessages)) return message.reply('Bu əmrlə işləmək üçün Manage Messages icazəsi lazımdır.');
        const count = Number(args[0]);
        if (!Number.isInteger(count) || count < 1 || count > 100) return message.reply('İstifadə: `!sil <1-100>`');
        try {
            const deleted = await clearMessages(message.channel, count);
            await logModAction(message.guild, 'sil', `${message.author.tag} → #${message.channel.name}: ${deleted} mesaj silindi.`);

            const confirmation = await message.channel.send(`✅ **${deleted}** mesaj uğurla silindi.`);

            setTimeout(async () => {
                try {
                    await confirmation.delete();
                } catch (err) {
                    // Ignore if already deleted
                }
            }, 3000);
        } catch (error) {
            logError('!sil', error);
            const errorMsg = await message.channel.send('❌ Mesajlar silinə bilmədi.');
            setTimeout(() => errorMsg.delete().catch(() => {}), 3000);
        }
    },
};
