const {
    EmbedBuilder,
    PermissionFlagsBits,
    SlashCommandBuilder,
} = require('discord.js');
const { getLogChannelId } = require('../utils/storage');
const { ephemeralReply } = require('../utils/interaction');
const { t } = require('../utils/lang');

const COLORS = { off: 0xED4245, missing: 0xE67E22, warn: 0xF1C40F, ok: 0x57F287 };

/**
 * Builds the log-status embed. Shared by the slash and prefix paths so the
 * two can never drift apart again.
 */
async function buildEmbed(guild, client, guildId, { slash = true } = {}) {
    const channelId = await getLogChannelId(guildId);
    const cmd = slash ? '/setlog' : '!setlog';

    let statusText = t(guildId, 'logstatus_off');
    let channelMention = t(guildId, 'logstatus_unassigned');
    let channelIdText = t(guildId, 'logstatus_none');
    let healthText = t(guildId, 'logstatus_assign_help', { cmd });
    let color = COLORS.off;

    if (channelId) {
        const channel = guild.channels.cache.get(channelId)
            || await guild.channels.fetch(channelId).catch(() => null);

        if (!channel) {
            statusText = t(guildId, 'logstatus_error_missing');
            channelMention = `<#${channelId}> *(${t(guildId, 'logstatus_not_found')})*`;
            channelIdText = `\`${channelId}\``;
            healthText = t(guildId, 'logstatus_channel_gone', { cmd });
            color = COLORS.missing;
        } else {
            channelMention = `${channel} (\`#${channel.name}\`)`;
            channelIdText = `\`${channel.id}\``;

            const me = guild.members.me
                || (client?.user ? await guild.members.fetch(client.user.id).catch(() => null) : null);
            if (me) {
                const botPerms = channel.permissionsFor(me);
                const missing = [];
                if (!botPerms?.has(PermissionFlagsBits.ViewChannel)) missing.push(t(guildId, 'perm_view_channel'));
                if (!botPerms?.has(PermissionFlagsBits.SendMessages)) missing.push(t(guildId, 'perm_send_messages'));
                if (!botPerms?.has(PermissionFlagsBits.EmbedLinks)) missing.push(t(guildId, 'perm_embed_links'));

                if (missing.length > 0) {
                    statusText = t(guildId, 'logstatus_warn_perms');
                    healthText = t(guildId, 'logstatus_missing_perms', { list: missing.map((p) => `• **${p}**`).join('\n') });
                    color = COLORS.warn;
                } else {
                    statusText = t(guildId, 'logstatus_ok_ready');
                    healthText = t(guildId, 'logstatus_health_ok');
                    color = COLORS.ok;
                }
            } else {
                statusText = t(guildId, 'logstatus_ok');
                healthText = t(guildId, 'logstatus_assigned');
                color = COLORS.ok;
            }
        }
    }

    return new EmbedBuilder()
        .setTitle(t(guildId, 'logstatus_title'))
        .setColor(color)
        .setDescription(t(guildId, 'logstatus_text', { server: guild.name }))
        .addFields([
            { name: t(guildId, 'logstatus_status_field'), value: statusText, inline: true },
            { name: t(guildId, 'setlog_set_channel'), value: channelMention, inline: true },
            { name: t(guildId, 'logstatus_channel_id'), value: channelIdText, inline: true },
            { name: t(guildId, 'logstatus_health_field'), value: healthText, inline: false },
            { name: t(guildId, 'logstatus_change_field'), value: t(guildId, 'logstatus_change_help', { cmd }), inline: false },
        ])
        .setFooter({ text: t(guildId, 'logstatus_footer') })
        .setTimestamp();
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('logstatus')
        .setDescription('Shows the current server log system status')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const guildId = interaction.guild_id || interaction.guild?.id;
        if (!guildId) return ephemeralReply(t(null, 'logstatus_server_only'));

        const client = interaction.discordClient || interaction.client;
        let guild = interaction.guild;
        if (!guild && client) {
            guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
        }
        if (!guild) return ephemeralReply(t(guildId, 'logstatus_no_guild'));

        const embed = await buildEmbed(guild, client, guildId, { slash: true });

        if (typeof interaction.reply === 'function' && !interaction.replied && !interaction.deferred) {
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        return ephemeralReply(null, [embed.toJSON()]);
    },

    prefixExecute: async (message) => {
        const guildId = message.guild?.id;
        if (!guildId) return message.reply(t(null, 'logstatus_server_only'));
        if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply(t(guildId, 'perm_admin_only'));
        }

        const embed = await buildEmbed(message.guild, message.client, guildId, { slash: false });
        return message.reply({ embeds: [embed] });
    },

    buildEmbed,
};
