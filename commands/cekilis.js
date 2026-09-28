const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { ephemeralReply, getOption } = require('../utils/interaction');
const { can } = require('../utils/moderation');
const { parseDuration, formatDuration } = require('../utils/duration');
const db = require('../utils/db');
const { isEnabled, pickWinners } = require('../utils/cekilis');

const JOIN_ID = 'foxcraft:cekilis-join';

function giveawayEmbed(g, status = 'active') {
    const desc = status === 'active'
        ? `🎉 **Son:** <t:${Math.floor(g.ends_at / 1000)}:R>\n🏆 **Qaliblər:** ${g.winners}\n👥 **İştirakçılar:** ${g.entrants.length}`
        : 'Bu çəkiliş sona çatdı.';
    return {
        title: `🎉 ${g.prize}`,
        description: desc,
        color: 0xFF73FA,
        footer: { text: `Her host: ${g.host_id ? `<@${g.host_id}>` : '—'}` },
        timestamp: new Date().toISOString(),
    };
}

function buildJoinButton(messageId) {
    return [{ type: 2, custom_id: `${JOIN_ID}:${messageId}`, label: '🎉 Qatıl', style: 1, emoji: { name: '🎉' } }];
}

async function fetchChannel(interaction) {
    if (interaction.channel) return interaction.channel;
    return interaction.discordClient.channels.fetch(interaction.channel_id).catch(() => null);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cekilis')
        .setDescription('Çəkiliş başladır və ya yenidən həyata keçirir')
        .addSubcommand((sub) => sub
            .setName('baslat')
            .setDescription('Yeni çəkiliş başlat')
            .addStringOption((option) => option.setName('mukafat').setDescription('Çəkilişin mükafatı').setRequired(true))
            .addStringOption((option) => option.setName('muddet').setDescription('Müddət, məs: 1h, 2d, 30m').setRequired(true))
            .addIntegerOption((option) => option.setName('qalib').setDescription('Qalib sayı').setMinValue(1).setMaxValue(20).setRequired(false)))
        .addSubcommand((sub) => sub
            .setName('yeniden')
            .setDescription('Çəkiliş üçün yeni qalib seç')
            .addStringOption((option) => option.setName('mesaj').setDescription('Çəkiliş mesajının ID-si').setRequired(true))),
    async execute(interaction) {
        if (!can(interaction.member, PermissionFlagsBits.ManageMessages)) return ephemeralReply('Bu əmrlə işləmək üçün Manage Messages icazəsi lazımdır.');
        const sub = interaction.data?.options?.[0]?.name || interaction.options?.getSubcommand?.();

        if (sub === 'yeniden') {
            const messageId = getOption(interaction, 'mesaj') || interaction.options?.get('mesaj')?.value;
            const g = db.getGiveaway(messageId);
            if (!g) return ephemeralReply('Bu çəkiliş tapılmadı.');
            if (!g.ended) return ephemeralReply('Çəkiliş hələ bitməyib — qaliblər özü seçiləcək.');
            const winners = pickWinners(g.entrants, g.winners, g.winnersList || []);
            if (!winners.length) return ephemeralReply('Qalib seçmək üçün iştirakçı qalmayıb.');
            const newList = [...(g.winnersList || []), ...winners];
            db.updateGiveaway(messageId, { winnersList: newList });
            return ephemeralReply(`🎊 Yeni qaliblər: ${winners.map((id) => `<@${id}>`).join(' ')}`);
        }

        // baslat
        if (!isEnabled(interaction.guild_id)) return ephemeralReply('Çəkiliş sistemi hazırda deaktivdir. Paneldən aktivləşdirmək lazımdır.');
        const prize = getOption(interaction, 'mukafat');
        const durationMs = parseDuration(getOption(interaction, 'muddet'));
        const winners = Number(getOption(interaction, 'qalib') || interaction.options?.get('qalib')?.value || 1);
        if (!prize) return ephemeralReply('Çəkiliş mükafatını yaz.');
        if (!durationMs) return ephemeralReply('Düzgün müddət yaz: `1h`, `30m`, `2d`.');
        try {
            const channel = await fetchChannel(interaction);
            if (!channel?.isTextBased()) return ephemeralReply('Uyğun kanal tapılmadı.');
            const hostId = interaction.user?.id || interaction.member?.user?.id;
            const entered = await channel.send({
                embeds: [giveawayEmbed({
                    prize, ends_at: Date.now() + durationMs, winners, entrants: [], host_id: hostId,
                })],
                components: [{ type: 1, components: buildJoinButton('pending') }],
            });
            db.createGiveaway({
                messageId: entered.id, guildId: interaction.guild_id, channelId: channel.id,
                prize, endsAt: Date.now() + durationMs, winners, hostId,
            });
            await entered.edit({ components: [{ type: 1, components: buildJoinButton(entered.id) }] });
            return ephemeralReply(`🎉 Çəkiliş başladı: **${prize}** (${formatDuration(durationMs)})\nMükafat: <#${channel.id}>`);
        } catch (error) {
            console.error('[CEKILIS] Çəkiliş başladılmadı:', error.message);
            return ephemeralReply('Çəkiliş başladılmadı.');
        }
    },
    async prefixExecute(message, args) {
        if (!can(message.member, PermissionFlagsBits.ManageMessages)) return message.reply('Bu əmrlə işləmək üçün Manage Messages icazəsi lazımdır.');
        const [sub, ...rest] = args;

        if (sub === 'yenidən') {
            const g = db.getGiveaway(rest[0]);
            if (!g) return message.reply('Bu çəkiliş tapılmadı.');
            if (!g.ended) return message.reply('Çəkiliş hələ bitməyib — qaliblər özü seçiləcək.');
            const winners = pickWinners(g.entrants, g.winners, g.winnersList || []);
            if (!winners.length) return message.reply('Qalib seçmək üçün iştirakçı qalmayıb.');
            db.updateGiveaway(String(g.message_id), { winnersList: [...(g.winnersList || []), ...winners] });
            return message.reply(`🎊 Yeni qaliblər: ${winners.map((id) => `<@${id}>`).join(' ')}`);
        }

        const [prize, duration, winnersArg] = rest;
        const durationMs = parseDuration(duration);
        const winners = Number(winnersArg || 1);
        if (!prize || !durationMs) return message.reply('İstifadə: `!cekilis başlat <mükafat> <müddət> [qalib sayı]`');
        if (!isEnabled(message.guild.id)) return message.reply('Çəkiliş sistemi hazırda deaktivdir.');
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
        return message.reply(`🎉 Çəkiliş başladı: **${prize}** (${formatDuration(durationMs)})`);
    },
    giveawayEmbed,
};