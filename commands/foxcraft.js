const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { ephemeralReply } = require('../utils/interaction');
const {
    discordRequest,
    envValue,
    foxcraftEmbed,
    getLogoData,
    isGuildOwnerOrAdmin,
} = require('../utils/foxcraft');

const ROLE_NAMES = [
    'Sahibi', 'Qurucu', 'Developer', 'Admin', 'Moderator', 'Test Moderator',
    'Yetkili Cavabdehi', 'Medya', 'Bot', 'Xüsusi Üzv', 'Premium', 'FoxVip+',
    'FoxVip', 'VIP+', 'VIP', 'Lady', 'Oyuncu',
];

async function attempt(label, operation, summary) {
    try {
        await operation();
        summary.push(`${label}: uğurlu`);
    } catch (error) {
        const details = {
            message: error.message,
            status: error.status ?? error.httpStatus ?? null,
            code: error.code ?? error.data?.code ?? null,
            discordError: error.data ?? null,
        };
        console.error(`[FOXCRAFT] ${label} uğursuz oldu:`, JSON.stringify(details));
        summary.push(`${label}: uğursuz (${details.status === 403 ? 'icazə/API rəddi' : 'xəta'})`);
    }
}

async function rebrand(interaction) {
    const summary = [];
    const guildId = interaction.guild_id;
    const dryRun = envValue('FOXCRAFT_DRY_RUN').toLowerCase() === 'true';
    if (dryRun) return ['Dry run aktivdir: heç bir dəyişiklik edilmədi.'];
    let botMember;
    let permissions;
    try {
        if (!interaction.discordClient?.isReady()) {
            throw new Error('Discord.js gateway client hazır deyil; fresh guild member yoxlanıla bilmədi');
        }
        const guild = await interaction.discordClient.guilds.fetch(guildId);
        await guild.roles.fetch();
        botMember = guild.members.me
            ? await guild.members.me.fetch()
            : await guild.members.fetch({
                user: interaction.discordClient.user.id,
                force: true,
            });
        permissions = botMember.permissions;
        console.log('[FOXCRAFT] Fresh bot permission snapshot:', {
            guildId,
            botUserId: botMember.user.id,
            botRoleIds: botMember.roles.cache.map((role) => role.id),
            permissions: permissions.toArray(),
            permissionBitfield: permissions.bitfield.toString(),
        });
    } catch (error) {
        console.error('[FOXCRAFT] Fresh bot member/permission fetch failed:', {
            message: error.message,
            code: error.code ?? null,
            status: error.status ?? error.httpStatus ?? null,
            stack: error.stack,
        });
        summary.push('Bot icazələri: yoxlanılmadı (fresh member fetch uğursuz oldu)');
        return summary;
    }
    const canManageGuild = permissions.has(PermissionFlagsBits.ManageGuild);
    const canManageRoles = permissions.has(PermissionFlagsBits.ManageRoles);
    const canChangeNickname = permissions.has(PermissionFlagsBits.ChangeNickname);
    const canManageNicknames = permissions.has(PermissionFlagsBits.ManageNicknames);
    console.log('[FOXCRAFT] Permission decisions:', {
        ManageGuild: canManageGuild,
        ManageRoles: canManageRoles,
        ChangeNickname: canChangeNickname,
        ManageNicknames: canManageNicknames,
    });
    let logo = null;
    try {
        logo = await getLogoData();
    } catch (error) {
        console.error('[FOXCRAFT] Logo yüklənmədi:', error.message);
        summary.push('Server ikonu: uğursuz (logo mənbəyi əlçatan deyil)');
    }
    if (!canManageGuild) {
        summary.push('Server adı və ikonu: uğursuz (botda Manage Guild icazəsi yoxdur)');
        console.error('[FOXCRAFT] Guild permission check failed:', {
            required: 'ManageGuild',
            actual: permissions.toArray(),
        });
    } else {
        await attempt('Server adı', () => discordRequest('PATCH', `/guilds/${guildId}`, {
            name: 'FoxCraft',
            ...(logo ? { icon: logo } : {}),
        }), summary);
    }
    if (!logo) summary.push('Server ikonu: logo faylı/FOXCRAFT_LOGO_URL tapılmadı');
    if (canChangeNickname || canManageNicknames) {
        await attempt('Bot ləqəbi', () => discordRequest('PATCH', `/guilds/${guildId}/members/@me`, { nick: 'FoxCraft' }), summary);
    } else {
        summary.push('Bot ləqəbi: uğursuz (Change Nickname və Manage Nicknames yoxdur)');
        console.error('[FOXCRAFT] Bot nickname permission check failed:', {
            required: ['ChangeNickname', 'ManageNicknames'],
            actual: permissions.toArray(),
        });
    }
    await attempt('Bot avatarı', async () => {
        if (!logo) throw new Error('Logo mənbəyi yoxdur');
        await discordRequest('PATCH', '/users/@me', { avatar: logo });
    }, summary);
    if (!canManageRoles) {
        summary.push('Rollar: uğursuz (botda Manage Roles icazəsi yoxdur)');
        console.error('[FOXCRAFT] Role permission check failed:', {
            required: 'ManageRoles',
            actual: permissions.toArray(),
        });
    } else {
        await attempt('Rollar', async () => {
            const roles = await discordRequest('GET', `/guilds/${guildId}/roles`);
            const existing = new Set(roles.map((role) => role.name));
            for (const name of ROLE_NAMES) {
                if (!existing.has(name)) {
                    await discordRequest('POST', `/guilds/${guildId}/roles`, {
                        name,
                        permissions: '0',
                        reason: 'FoxCraft rebrand',
                    });
                }
            }
        }, summary);
    }
    return summary;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('foxcraft')
        .setDescription('Bu serveri FoxCraft olaraq rebrend edir'),
    async execute(interaction) {
        if (!interaction.guild_id) return ephemeralReply('FoxCraft yalnız serverdə istifadə oluna bilər.');
        let guild;
        try {
            guild = await discordRequest('GET', `/guilds/${interaction.guild_id}?with_counts=false`);
        } catch (error) {
            console.error('[FOXCRAFT] Server məlumatı alınmadı:', error.message);
            return ephemeralReply('FoxCraft server məlumatları yoxlanılmadı. Botun serverə girişini və icazələrini yoxla.');
        }
        if (!isGuildOwnerOrAdmin(interaction, guild)) {
            return ephemeralReply('Bu əmrdən yalnız server sahibi, administrator və ya OWNER_ID istifadə edə bilər.');
        }
        const summary = await rebrand(interaction);
        return ephemeralReply(null, [foxcraftEmbed('FoxCraft', `Rebrand nəticəsi:\n${summary.join('\n')}`)]);
    },
};
