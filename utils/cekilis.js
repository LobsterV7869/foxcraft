/**
 * Çəkiliş (giveaway) system. Giveaways are created via /cekilis (or !cekilis),
 * members join by pressing a button, and winners are auto-picked when the time
 * runs out. Reroll picks a new winner from the remaining entrants. Giveaways
 * are SQLite-backed so they survive restarts.
 */

const { getModules } = require('./db');
const db = require('./db');
const { registerComponent } = require('./ui');
const { t } = require('./lang');

const JOIN_PREFIX = 'foxcraft:cekilis-join';

function shuffle(array) {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

function pickWinners(entrants, count, exclude = []) {
    const pool = entrants.filter((id) => !exclude.includes(id));
    if (pool.length === 0) return [];
    return shuffle(pool).slice(0, Math.min(count, pool.length));
}

async function announceWinners(giveaway, client) {
    try {
        const channel = await client.channels.fetch(giveaway.channel_id).catch(() => null);
        if (!channel) return;
        const winners = pickWinners(giveaway.entrants, giveaway.winners, giveaway.winnersList || []);
        const newWinnerList = [...(giveaway.winnersList || []), ...winners];
        db.updateGiveaway(giveaway.message_id, { winnersList: newWinnerList, ended: 1 });
        const gid = channel.guild?.id;
        const mentions = winners.length ? winners.map((id) => `<@${id}>`).join(' ') : t(gid, 'giveaway_no_winners');
        const embed = {
            title: `${giveaway.prize}`,
            description: winners.length
                ? t(gid, 'giveaway_ended_desc', { winners: mentions })
                : t(gid, 'giveaway_cancelled'),
            color: 0x57F287,
            timestamp: new Date().toISOString(),
            footer: { text: t(gid, 'giveaway_footer', { count: giveaway.entrants.length }) },
        };
        await channel.send({
            content: winners.length ? mentions : undefined,
            embeds: [embed],
            allowedMentions: { users: winners },
        }).catch(() => {});
    } catch (error) {
        console.error('[GIVEAWAY] Winners could not be announced:', error.message);
    }
}

/**
 * Sweeps finished giveaways and announces winners. Called on an interval and
 * once at startup so giveaways from before a restart finish correctly.
 */
async function sweep(client) {
    const now = Date.now();
    const finished = (await db.listActiveGiveaways()).filter((g) => Number(g.ends_at) <= now);
    for (const giveaway of finished) {
        await announceWinners(giveaway, client);
    }
}

function registerComponents() {
    registerComponent(JOIN_PREFIX, async (ctx) => {
        const messageId = ctx.customId.slice(JOIN_PREFIX.length + 1);
        const result = db.addGiveawayEntrant(messageId, ctx.user.id);
        if (result.reason === 'notfound') {
            await ctx.reply({ content: t(ctx.guildId, 'giveaway_not_found'), ephemeral: true });
        } else if (result.reason === 'ended') {
            await ctx.reply({ content: t(ctx.guildId, 'giveaway_ended_already'), ephemeral: true });
        } else if (result.reason === 'duplicate') {
            await ctx.reply({ content: t(ctx.guildId, 'giveaway_already'), ephemeral: true });
        } else {
            await ctx.reply({ content: t(ctx.guildId, 'giveaway_enter', { entrants: result.entrants }), ephemeral: true });
        }
    });
}

function isEnabled(guildId) {
    return getModules(guildId).cekilis.enabled !== false;
}

module.exports = { isEnabled, sweep, registerComponents, pickWinners };