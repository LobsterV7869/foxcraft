/**
 * Qeydiyyat (registration) system. The /qeydiyyat command configures a
 * channel and a target role; it posts a panel whose button registers members
 * by assigning the role. Toggle via panel.
 */

const { getModules, updateGuildData } = require('./db');
const { registerComponent } = require('./ui');

const REGISTER_ID = 'foxcraft:qeydiyyat-register';

function setup(guildId, { channel = '', role = '', message = '' } = {}) {
    const modules = getModules(guildId);
    if (!modules.qeydiyyat) modules.qeydiyyat = {};
    if (channel) modules.qeydiyyat.channel = channel;
    if (role) modules.qeydiyyat.role = role;
    if (message) modules.qeydiyyat.message = message;
    modules.qeydiyyat.enabled = true;
    updateGuildData(guildId, { modules });
    return modules.qeydiyyat;
}

function teardown(guildId) {
    const modules = getModules(guildId);
    modules.qeydiyyat.enabled = false;
    updateGuildData(guildId, { modules });
}

async function handleRegister(ctx) {
    const config = getModules(ctx.guildId).qeydiyyat;
    if (!config || config.enabled !== true) {
        await ctx.reply({ content: 'Qeydiyyat sistemi hazırda deaktivdir.', ephemeral: true });
        return;
    }
    if (!config.role) {
        await ctx.reply({ content: 'Qeydiyyat rolu qurulmayıb. `/qeydiyyat` ilə rol təyin et.', ephemeral: true });
        return;
    }
    try {
        const guild = await ctx.guild();
        const member = await guild.members.fetch(ctx.user.id);
        let role = guild.roles.cache.get(config.role);
        if (!role) role = await guild.roles.fetch(config.role).catch(() => null);
        if (!role || role.id !== config.role) {
            await ctx.reply({ content: 'Təyin olunmuş rol serverdə tapılmadı.', ephemeral: true });
            return;
        }
        if (member.roles.cache.has(role.id)) {
            await ctx.reply({ content: 'Sən artıq qeydiyyatdan keçmisən. ✅', ephemeral: true });
            return;
        }
        await member.roles.add(role, 'Qeydiyyat sistemi');
        await ctx.reply({ content: 'Qeydiyyatdan keçdin — rolun verildi! 🎉', ephemeral: true });
    } catch (error) {
        console.error('[QEYDIYYAT] Qeydiyyat xətası:', error.message);
        await ctx.reply({ content: 'Qeydiyyat həyata keçirilmədi. Daha sonra yenidən cəhd et.', ephemeral: true });
    }
}

function registerComponents() {
    registerComponent(REGISTER_ID, handleRegister);
}

module.exports = { setup, teardown, handleRegister, registerComponents };