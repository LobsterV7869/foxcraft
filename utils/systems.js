/**
 * Aggregates the background systems that hook into gateway events:
 *  - automod  (link/invite/caps/spam/words filters)
 *  - sayma    (configured counting channels — consumes the message)
 *  - afk      (auto-clear + mention announcements)
 *  - welcomer (welcome/leave messages, auto-role, DM)
 */

const automod = require('./automod');
const sayma = require('./sayma');
const afk = require('./afk');
const welcomer = require('./welcomer');

/**
 * Runs message-side systems. Returns true when the message was consumed by
 * the counting system (index.js should skip number/word games for it).
 */
async function handleMessage(message) {
    if (!message.guild || message.author.bot) return false;
    let consumed = false;
    try {
        if (await sayma.handleMessage(message)) consumed = true;
    } catch (error) {
        console.error('[SYSTEMS] Sayma xətası:', error.message);
    }
    try {
        await automod.handleMessage(message);
    } catch (error) {
        console.error('[SYSTEMS] Automod xətası:', error.message);
    }
    try {
        await afk.handleMessage(message);
    } catch (error) {
        console.error('[SYSTEMS] AFK xətası:', error.message);
    }
    return consumed;
}

async function onMemberAdd(member) {
    try {
        await welcomer.onMemberAdd(member);
    } catch (error) {
        console.error('[SYSTEMS] Welcomer xətası:', error.message);
    }
}

async function onMemberRemove(member) {
    try {
        await welcomer.onMemberRemove(member);
    } catch (error) {
        console.error('[SYSTEMS] Çıxış welcomer xətası:', error.message);
    }
}

module.exports = { handleMessage, onMemberAdd, onMemberRemove };