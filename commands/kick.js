const { PermissionFlagsBits } = require('discord.js');
const { ephemeralReply } = require('../utils/interaction');
const { buildUserCommand } = require('../utils/moderation');
module.exports = buildUserCommand('kick', PermissionFlagsBits.KickMembers, (target, reason) => target.kick(reason), (tag) => `${tag} serverdən uzaqlaşdırıldı.`, ephemeralReply);
