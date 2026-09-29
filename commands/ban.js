const { PermissionFlagsBits } = require('discord.js');
const { ephemeralReply } = require('../utils/interaction');
const { buildUserCommand } = require('../utils/moderation');
module.exports = buildUserCommand('ban', PermissionFlagsBits.BanMembers, (target, reason) => target.ban({ reason }), (tag) => `${tag} was banned from the server.`, ephemeralReply);
