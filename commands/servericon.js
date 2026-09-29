/**
 * /servericon — sets the FoxCraft server icon.
 * Uses FOXCRAFT_LOGO_URL or FOXCRAFT_LOGO_FILE when no attachment is given, so
 * the command can be run from the prefix or from a slash command in DMs-less
 * admin flows. Discord only accepts base64 PNG/JPEG/GIF under 256 KB.
 */

const fs = require('fs');
const path = require('path');
const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { ephemeralReply } = require('../utils/interaction');
const { can, logError } = require('../utils/moderation');
const { envValue } = require('../utils/foxcraft');

const { t } = require('../utils/lang');

const MAX_BYTES = 256 * 1024;
const ALLOWED = new Map([['image/png', 'png'], ['image/jpeg', 'jpeg'], ['image/gif', 'gif']]);

function readLogoFile() {
    const configured = envValue('FOXCRAFT_LOGO_FILE');
    const file = configured ? path.resolve(configured) : path.join(__dirname, '..', 'assets', 'logo.png');
    if (!fs.existsSync(file)) return null;
    return fs.readFileSync(file);
}

async function logoFromAttachment(attachment) {
    if (!attachment) return null;
    if (attachment.size > MAX_BYTES) throw new Error('The image must be smaller than 256 KB.');
    const type = ALLOWED.get(attachment.contentType || '');
    if (!type) throw new Error('The image must be a PNG, JPEG or GIF file.');
    const buffer = await attachment.fetch();
    return { buffer, type };
}

async function setIcon(guild, source, actor) {
    if (source.type === 'attachment') {
        const { buffer, type } = source;
        await guild.edit({ icon: buffer.toString('base64') }, `Server icon set by ${actor}`);
        return true;
    }
    const url = source.url;
    const response = await fetch(url);
    if (!response.ok) throw new Error('The configured image could not be downloaded.');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_BYTES) throw new Error('The image must be smaller than 256 KB.');
    const type = (response.headers.get('content-type') || '').split(';')[0];
    if (!ALLOWED.has(type)) throw new Error('The image must be a PNG, JPEG or GIF file.');
    await guild.edit({ icon: buffer.toString('base64') }, `Server icon set by ${actor}`);
    return true;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('servericon')
        .setDescription('Sets the server icon from an image, or from the configured logo')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addAttachmentOption((option) => option
            .setName('image')
            .setDescription('PNG, JPEG or GIF under 256 KB. Leave empty to use the configured logo.')
            .setRequired(false)),
    async execute(interaction) {
        if (!can(interaction.member, PermissionFlagsBits.ManageGuild)) {
            return ephemeralReply(t(interaction.guild_id, 'perm_manage_guild'));
        }
        try {
            const guild = await interaction.discordClient.guilds.fetch(interaction.guild_id);
            const actorTag = interaction.user?.tag || interaction.member?.user?.tag || 'someone';
            let source;
            try {
                const attachment = interaction.attachments?.first?.() || null;
                const fromAttachment = await logoFromAttachment(attachment);
                if (fromAttachment) {
                    source = { type: 'attachment', ...fromAttachment };
                }
            } catch (error) {
                return ephemeralReply(error.message);
            }
            if (!source) {
                const url = envValue('FOXCRAFT_LOGO_URL');
                if (url) {
                    source = { type: 'url', url };
                } else {
                    const buffer = readLogoFile();
                    if (!buffer) return ephemeralReply(t(interaction.guild_id, 'servericon_no_image'));
                    source = { type: 'attachment', buffer, type: 'png' };
                }
            }
            try {
                await setIcon(guild, source, actorTag);
            } catch (error) {
                return ephemeralReply(error.message);
            }
            return ephemeralReply(t(interaction.guild_id, 'servericon_done'));
        } catch (error) {
            logError('/servericon', error);
            return ephemeralReply(t(interaction.guild_id, 'servericon_failed'));
        }
    },
    async prefixExecute(message, args) {
        if (!can(message.member, PermissionFlagsBits.ManageGuild)) {
            return message.reply(t(message.guild?.id, 'perm_manage_guild'));
        }
        if (args[0]) return message.reply(t(message.guild?.id, 'servericon_usage'));
        try {
            const url = envValue('FOXCRAFT_LOGO_URL');
            const buffer = url ? null : readLogoFile();
            if (!url && !buffer) {
                return message.reply(t(message.guild?.id, 'servericon_no_logo'));
            }
            await setIcon(message.guild, url ? { type: 'url', url } : { type: 'attachment', buffer, type: 'png' }, message.author.tag);
            return message.reply(t(message.guild?.id, 'servericon_done'));
        } catch (error) {
            logError('!servericon', error);
            return message.reply(error.message || t(message.guild?.id, 'servericon_failed'));
        }
    },
};
