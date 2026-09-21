const { PermissionFlagsBits } = require('discord.js');
const { ephemeralReply } = require('../utils/interaction');
const { buildUserCommand } = require('../utils/moderation');
module.exports = buildUserCommand('mute', PermissionFlagsBits.ModerateMembers, (target, reason) => target.timeout(10 * 60 * 1000, reason), (tag) => `${tag} 10 dəqiqəlik susduruldu.`, ephemeralReply);
