const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { ephemeralReply, getOption } = require('../utils/interaction');
const { can } = require('../utils/moderation');
const { parseDuration, formatDuration } = require('../utils/duration');
const db = require('../utils/db');
const { isEnabled, pickWinners } = require('../utils/cekilis');

const { t } = require('../utils/lang');

const JOIN_ID = 'foxcraft:cekilis-join';

function giveawayEmbed(g, status = 'active', guildId) {
    const desc = status === 'active'
        ? `**${t(guildId, 'giveaway_ends')}:** <t:${Math.floor(g.ends_at / 1000)}:R>\n**${t(guildId, 'giveaway_winners')}:** ${g.winners}\n**${t(guildId, 'giveaway_entrants')}:** ${g.entrants.length}`
        : t(guildId, 'giveaway_ended_title');
    return {
        title: `${g.prize}`,
        description: desc,
        color: 0xFF73FA,
        footer: { text: `${t(guildId, 'giveaway_host')}: ${g.host_id ? `<@${g.host_id}>` : '—'}` },
        timestamp: new Date().toISOString(),
    };
}

function buildJoinButton(messageId, guildId) {
    return [{ type: 2, custom_id: `${JOIN_ID}:${messageId}`, label: t(guildId, 'giveaway_join'), style: 1 }];
}

async function fetchChannel(interaction) {
    if (interaction.channel) return interaction.channel;
    return interaction.discordClient.channels.fetch(interaction.channel_id).catch(() => null);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cekilis')
        .setDescription('Starts a giveaway or reruns the current one')
        .addSubcommand((sub) => sub
            .setName('baslat')
            .setDescription('Start a new giveaway')
            .addStringOption((option) => option.setName('mukafat').setDescription('Giveaway prize').setRequired(true))
            .addStringOption((option) => option.setName('muddet').setDescription('Duration, e.g. 1h, 2d, 30m').setRequired(true))
            .addIntegerOption((option) => option.setName('qalib').setDescription('Number of winners').setMinValue(1).setMaxValue(20).setRequired(false)))
        .addSubcommand((sub) => sub
            .setName('yeniden')
            .setDescription('Pick a new winner for the giveaway')
            .addStringOption((option) => option.setName('mesaj').setDescription('Giveaway message ID').setRequired(true))),
    async execute(interaction) {
        if (!can(interaction.member, PermissionFlagsBits.ManageMessages)) return ephemeralReply(t(interaction.guild_id, 'perm_manage_messages'));
        const sub = interaction.data?.options?.[0]?.name || interaction.options?.getSubcommand?.();

        if (sub === 'yeniden') {
            const messageId = getOption(interaction, 'mesaj') || interaction.options?.get('mesaj')?.value;
            const g = db.getGiveaway(messageId);
            if (!g) return ephemeralReply(t(interaction.guild_id, 'giveaway_not_found'));
            if (!g.ended) return ephemeralReply(t(interaction.guild_id, 'giveaway_in_progress'));
            const winners = pickWinners(g.entrants, g.winners, g.winnersList || []);
            if (!winners.length) return ephemeralReply(t(interaction.guild_id, 'giveaway_no_participants'));
            const newList = [...(g.winnersList || []), ...winners];
            db.updateGiveaway(messageId, { winnersList: newList });
            return ephemeralReply(t(interaction.guild_id, 'giveaway_winners_line', { winners: winners.map((id) => `<@${id}>`).join(' ') }));
        }

        // baslat
        if (!isEnabled(interaction.guild_id)) return ephemeralReply(t(interaction.guild_id, 'giveaway_disabled_panel'));
        const prize = getOption(interaction, 'mukafat');
        const durationMs = parseDuration(getOption(interaction, 'muddet'));
        const winners = Number(getOption(interaction, 'qalib') || interaction.options?.get('qalib')?.value || 1);
        if (!prize) return ephemeralReply(t(interaction.guild_id, 'giveaway_need_prize'));
        if (!durationMs) return ephemeralReply(t(interaction.guild_id, 'giveaway_bad_duration'));
        try {
            const channel = await fetchChannel(interaction);
            if (!channel?.isTextBased()) return ephemeralReply(t(interaction.guild_id, 'giveaway_no_channel'));
            const hostId = interaction.user?.id || interaction.member?.user?.id;
            const entered = await channel.send({
                embeds: [giveawayEmbed({
                    prize, ends_at: Date.now() + durationMs, winners, entrants: [], host_id: hostId,
                })],
                components: [{ type: 1, components: buildJoinButton('pending', interaction.guild_id) }],
            });
            db.createGiveaway({
                messageId: entered.id, guildId: interaction.guild_id, channelId: channel.id,
                prize, endsAt: Date.now() + durationMs, winners, hostId,
            });
            await entered.edit({ components: [{ type: 1, components: buildJoinButton(entered.id, interaction.guild_id) }] });
            return ephemeralReply(t(interaction.guild_id, 'giveaway_started_with_channel', { prize, duration: formatDuration(durationMs), channel: channel.id }));
        } catch (error) {
            console.error('[CEKILIS] Çəkiliş başladılmadı:', error.message);
            return ephemeralReply(t(interaction.guild_id, 'giveaway_start_failed'));
        }
    },
    async prefixExecute(message, args) {
        if (!can(message.member, PermissionFlagsBits.ManageMessages)) return message.reply(t(message.guild?.id, 'perm_manage_messages'));
        const [sub, ...rest] = args;

        if (sub === 'yenidən') {
            const g = db.getGiveaway(rest[0]);
            if (!g) return message.reply(t(message.guild?.id, 'giveaway_not_found'));
            if (!g.ended) return message.reply(t(message.guild?.id, 'giveaway_in_progress'));
            const winners = pickWinners(g.entrants, g.winners, g.winnersList || []);
            if (!winners.length) return message.reply(t(message.guild?.id, 'giveaway_no_participants'));
            db.updateGiveaway(String(g.message_id), { winnersList: [...(g.winnersList || []), ...winners] });
            return message.reply(t(message.guild?.id, 'giveaway_winners_line', { winners: winners.map((id) => `<@${id}>`).join(' ') }));
        }

        const [prize, duration, winnersArg] = rest;
        const durationMs = parseDuration(duration);
        const winners = Number(winnersArg || 1);
        if (!prize || !durationMs) return message.reply(t(message.guild?.id, 'usage_giveaway'));
        if (!isEnabled(message.guild.id)) return message.reply(t(message.guild?.id, 'giveaway_disabled'));
        const entered = await message.channel.send({
            embeds: [giveawayEmbed({
                prize, ends_at: Date.now() + durationMs, winners, entrants: [], host_id: message.author.id,
            })],
            components: [{ type: 1, components: buildJoinButton('pending') }],
        });
        db.createGiveaway({
            messageId: entered.id, guildId: message.guild.id, channelId: message.channel.id,
            prize, endsAt: Date.now() + durationMs, winners, hostId: message.author.id,
        });
        await entered.edit({ components: [{ type: 1, components: buildJoinButton(entered.id) }] });
        return message.reply(t(message.guild?.id, 'giveaway_started', { prize: (prize), duration: (formatDuration(durationMs)) }));
    },
    giveawayEmbed,
};