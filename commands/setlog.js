const {
    ChannelType,
    EmbedBuilder,
    PermissionFlagsBits,
    SlashCommandBuilder,
} = require('discord.js');
const { setLogChannelId } = require('../utils/storage');
const { ephemeralReply, getOption } = require('../utils/interaction');
const { t } = require('../utils/lang');

/** Returns the Discord permission names the bot still needs in the target channel. */
function missingBotPerms(targetChannel, me) {
    if (!me) return [];
    const botPerms = targetChannel.permissionsFor(me);
    const missing = [];
    if (!botPerms?.has(PermissionFlagsBits.ViewChannel)) missing.push('perm_view_channel');
    if (!botPerms?.has(PermissionFlagsBits.SendMessages)) missing.push('perm_send_messages');
    if (!botPerms?.has(PermissionFlagsBits.EmbedLinks)) missing.push('perm_embed_links');
    return missing;
}

/**
 * Persists the log channel, posts the test embed and builds the confirmation
 * embed. Shared by the slash and prefix paths.
 */
async function applyLogChannel({ guild, client, targetChannel, guildId, authorId, cmd }) {
    const me = guild.members.me
        || (client?.user ? await guild.members.fetch(client.user.id).catch(() => null) : null);
    const missing = missingBotPerms(targetChannel, me);
    if (missing.length > 0) {
        return {
            error: t(guildId, 'log_missing_perms', { channel: targetChannel })
                + missing.map((key) => `• **${t(guildId, key)}**`).join('\n')
                + '\n\n' + t(guildId, 'setlog_perm_advice'),
        };
    }

    await setLogChannelId(guildId, targetChannel.id);

    const testEmbed = new EmbedBuilder()
        .setTitle(t(guildId, 'setlog_activated'))
        .setColor(0x57F287)
        .setDescription(t(guildId, 'log_already'))
        .addFields([
            { name: t(guildId, 'logstatus_channel'), value: `${targetChannel} (\`${targetChannel.name}\`)`, inline: true },
            { name: t(guildId, 'setlog_assigned_by'), value: `<@${authorId}>`, inline: true },
            { name: t(guildId, 'setlog_date'), value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
        ])
        .setFooter({ text: t(guildId, 'setlog_test_footer') })
        .setTimestamp();

    await targetChannel.send({ embeds: [testEmbed] }).catch((err) => {
        console.error('[SETLOG] Test message could not be sent:', err.message);
    });

    const replyEmbed = new EmbedBuilder()
        .setTitle(t(guildId, 'setlog_success'))
        .setColor(0x57F287)
        .setDescription(t(guildId, 'log_channel_set', { channel: targetChannel }))
        .addFields([
            { name: t(guildId, 'setlog_set_channel'), value: `${targetChannel} (\`${targetChannel.id}\`)`, inline: true },
            { name: t(guildId, 'logstatus_status'), value: t(guildId, 'logstatus_ok'), inline: true },
        ])
        .setFooter({ text: t(guildId, 'setlog_change_footer', { cmd }) })
        .setTimestamp();

    return { embed: replyEmbed };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setlog')
        .setDescription('Sets the channel that server logs are sent to')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption((option) =>
            option
                .setName('kanal')
                .setDescription('Text channel to send logs to')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(true)
        ),

    async execute(interaction) {
        const guildId = interaction.guild_id || interaction.guild?.id;
        if (!guildId) return ephemeralReply(t(null, 'setlog_server_only'));

        const memberPermissions = interaction.member?.permissions;
        const isAdmin = interaction.member?.permissions?.has
            ? interaction.member.permissions.has(PermissionFlagsBits.Administrator)
            : (BigInt(memberPermissions || 0) & BigInt(PermissionFlagsBits.Administrator)) === BigInt(PermissionFlagsBits.Administrator);
        if (!isAdmin) return ephemeralReply(t(guildId, 'perm_admin_only'));

        let channelId = null;
        if (interaction.options?.getChannel) {
            channelId = interaction.options.getChannel('kanal')?.id;
        }
        if (!channelId) {
            channelId = getOption(interaction, 'kanal') || interaction.options?.get('kanal')?.value;
        }
        if (!channelId) return ephemeralReply(t(guildId, 'setlog_no_channel'));

        const client = interaction.discordClient || interaction.client;
        let guild = interaction.guild;
        if (!guild && client) {
            guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
        }
        if (!guild) return ephemeralReply(t(guildId, 'setlog_no_guild'));

        const targetChannel = guild.channels.cache.get(channelId)
            || await guild.channels.fetch(channelId).catch(() => null);
        if (!targetChannel || !targetChannel.isTextBased()) {
            return ephemeralReply(t(guildId, 'setlog_bad_channel'));
        }

        const result = await applyLogChannel({
            guild, client, targetChannel, guildId, cmd: '/setlog',
            authorId: interaction.user?.id || interaction.member?.user?.id,
        });
        if (result.error) return ephemeralReply(result.error);

        if (typeof interaction.reply === 'function' && !interaction.replied && !interaction.deferred) {
            return interaction.reply({ embeds: [result.embed], ephemeral: true });
        }
        return ephemeralReply(null, [result.embed.toJSON()]);
    },

    prefixExecute: async (message, args) => {
        const guildId = message.guild?.id;
        if (!guildId) return message.reply(t(null, 'setlog_server_only'));
        if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply(t(guildId, 'perm_admin_only'));
        }

        const channelMention = message.mentions.channels.first();
        const rawId = args[0]?.replace(/[<#>]/g, '');
        const targetChannel = channelMention || (rawId ? message.guild.channels.cache.get(rawId) : null);
        if (!targetChannel || !targetChannel.isTextBased()) {
            return message.reply(t(guildId, 'setlog_bad_channel_prefix', { cmd: '!setlog' }));
        }

        const result = await applyLogChannel({
            guild: message.guild, client: message.client, targetChannel, guildId,
            cmd: '!setlog', authorId: message.author.id,
        });
        if (result.error) return message.reply(result.error);

        return message.reply({ embeds: [result.embed] });
    },

    missingBotPerms,
};
