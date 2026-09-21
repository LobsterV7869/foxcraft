const fs = require('fs');
const path = require('path');

const DISCORD_API = 'https://discord.com/api/v10';
const FOXCRAFT_COLOR = 0xff6b35;
const RULES = [
    '1. Digər üzvlərə hörmətlə yanaş.',
    '2. Spam və flood etmə.',
    '3. Reklamı icazəsiz paylaşma.',
    '4. Təhqir və ayrı-seçkiliyə yol vermə.',
    '5. Botlardan düzgün istifadə et.',
    '6. Serverdə bug və exploitlərdən sui-istifadə etmə.',
    '7. Moderatorların qərarlarına hörmət et.',
    '8. Minecraft serverinin qaydalarına əməl et.',
].join('\n');

function envValue(name, fallback = '') {
    const value = process.env[name];
    return value && value.trim() ? value.trim() : fallback;
}

function foxcraftEmbed(title, description, fields = []) {
    return {
        title,
        description,
        color: FOXCRAFT_COLOR,
        fields,
        footer: {
            text: 'FoxCraft | Azərbaycan Minecraft icması',
            ...(envValue('FOXCRAFT_LOGO_URL') ? { icon_url: envValue('FOXCRAFT_LOGO_URL') } : {}),
        },
    };
}

function getServerValues() {
    return {
        ip: envValue('FOXCRAFT_SERVER_IP', 'Yaxında'),
        version: envValue('FOXCRAFT_VERSION', 'Yaxında'),
    };
}

function getLogoPath() {
    const configuredPath = envValue('FOXCRAFT_LOGO_PATH', 'assets/foxcraft-logo.png');
    const logoPath = path.isAbsolute(configuredPath)
        ? configuredPath
        : path.join(__dirname, '..', configuredPath);
    return fs.existsSync(logoPath) ? logoPath : null;
}

async function getLogoData() {
    const logoUrl = envValue('FOXCRAFT_LOGO_URL');
    if (logoUrl) {
        const response = await fetch(logoUrl);
        if (!response.ok) throw new Error(`FoxCraft logo URL returned ${response.status}`);
        const contentType = response.headers.get('content-type') || 'image/png';
        return `data:${contentType};base64,${Buffer.from(await response.arrayBuffer()).toString('base64')}`;
    }

    const logoPath = getLogoPath();
    if (!logoPath) return null;
    const extension = path.extname(logoPath).toLowerCase();
    const contentType = extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg' : 'image/png';
    return `data:${contentType};base64,${fs.readFileSync(logoPath).toString('base64')}`;
}

async function discordRequest(method, endpoint, body) {
    const token = envValue('DISCORD_TOKEN');
    if (!token) throw new Error('DISCORD_TOKEN is not configured');
    const response = await fetch(`${DISCORD_API}${endpoint}`, {
        method,
        headers: {
            Authorization: `Bot ${token}`,
            'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let data = null;
    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        data = text;
    }
    if (!response.ok) {
        const error = new Error(`Discord API ${response.status} for ${method} ${endpoint}`);
        error.status = response.status;
        error.data = data;
        throw error;
    }
    return data;
}

function hasPermission(interaction, permission) {
    const permissions = BigInt(interaction.member?.permissions || '0');
    return (permissions & BigInt(permission)) === BigInt(permission);
}

function isGuildOwnerOrAdmin(interaction, guild = null) {
    const userId = interaction.user?.id || interaction.member?.user?.id;
    return Boolean(
        interaction.guild_id &&
        (guild?.owner_id === userId ||
            hasPermission(interaction, 0x8) ||
            (envValue('OWNER_ID') && envValue('OWNER_ID') === userId))
    );
}

function hasDiscordPermission(permissionString, permission) {
    try {
        return (BigInt(permissionString || '0') & BigInt(permission)) === BigInt(permission);
    } catch {
        return false;
    }
}

async function fetchMinecraftStatus(ip) {
    if (ip === 'Yaxında') return null;
    const response = await fetch(`https://api.mcsrvstat.us/3/${encodeURIComponent(ip)}`, {
        signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`Minecraft status service returned ${response.status}`);
    return response.json();
}

function formatMinecraftStatus(status, version) {
    if (!status) {
        return { title: 'FoxCraft server statusu', description: 'Status məlumatı Yaxında olacaq.' };
    }
    if (!status.online) {
        return { title: 'FoxCraft server statusu', description: 'Server hazırda oflayndır.' };
    }
    const players = status.players
        ? `${status.players.online ?? 0}/${status.players.max ?? 'Yaxında'}`
        : 'Yaxında';
    return {
        title: 'FoxCraft server statusu',
        description: 'Server onlayndır.',
        fields: [
            { name: 'Oyunçular', value: players, inline: true },
            { name: 'Versiya', value: status.version || version, inline: true },
        ],
    };
}

module.exports = {
    FOXCRAFT_COLOR,
    RULES,
    envValue,
    foxcraftEmbed,
    getServerValues,
    getLogoData,
    discordRequest,
    hasPermission,
    isGuildOwnerOrAdmin,
    hasDiscordPermission,
    fetchMinecraftStatus,
    formatMinecraftStatus,
};
