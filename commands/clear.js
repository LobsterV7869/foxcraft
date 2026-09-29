const { SlashCommandBuilder } = require('discord.js');
const { ephemeralReply, getOption } = require('../utils/interaction');
const { PermissionFlagsBits, can, logError } = require('../utils/moderation');
const { logModAction } = require('../utils/modlog');
const { deleteLater } = require('../utils/foxcraft');

const { t } = require('../utils/lang');

async function clearMessages(channel, count) {
    const messages = await channel.messages.fetch({ limit: Math.min(count, 100) });
    const deletable = messages.filter((message) => Date.now() - message.createdTimestamp < 14 * 24 * 60 * 60 * 1000);
    if (deletable.size) await channel.bulkDelete(deletable, true);
    return deletable.size;
}

module.exports = {
    data: new SlashCommandBuilder().setName('clear').setDescription('Deletes recent messages in the channel')
        .addIntegerOption((option) => option.setName('amount').setDescription('Number of messages between 1 and 100').setMinValue(1).setMaxValue(100).setRequired(true)),
    aliases: ['sil', 'purge'],
    async execute(interaction) {
        if (!can(interaction.member, PermissionFlagsBits.ManageMessages)) return ephemeralReply(t(interaction.guild_id, 'perm_manage_messages'));
        try {
            const count = getOption(interaction, 'amount') ?? getOption(interaction, 'say');
            const deleted = await clearMessages(interaction.channel, count);
            const guild = await interaction.discordClient.guilds.fetch(interaction.guild_id);
            const actor = await guild.members.fetch(interaction.user?.id || interaction.member?.user?.id);
            await logModAction(guild, 'clear', `${actor.user.tag} -> #${interaction.channel?.name || interaction.channel_id}: deleted ${deleted} messages.`);
            return ephemeralReply(t(interaction.guild_id, 'messages_deleted', { count: (deleted) }));
        } catch (error) {
            logError('/clear', error);
            return ephemeralReply(t(interaction.guild_id, 'clear_failed'));
        }
    },
    async prefixExecute(message, args) {
        if (!can(message.member, PermissionFlagsBits.ManageMessages)) return message.reply(t(message.guild?.id, 'perm_manage_messages'));
        const count = Number(args[0]);
        if (!Number.isInteger(count) || count < 1 || count > 100) return message.reply(t(message.guild?.id, 'usage_clear'));
        try {
            const deleted = await clearMessages(message.channel, count);
            await logModAction(message.guild, 'clear', `${message.author.tag} -> #${message.channel.name}: deleted ${deleted} messages.`);

            const confirmation = await message.channel.send(`**${deleted}** messages were deleted.`);
            deleteLater(confirmation, 3000);
        } catch (error) {
            logError('!clear', error);
            const errorMsg = await message.channel.send(t(message.guild?.id, 'clear_failed'));
            deleteLater(errorMsg, 3000);
        }
    },
};
