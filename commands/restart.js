const { SlashCommandBuilder } = require('discord.js');
const { ephemeralReply } = require('../utils/interaction');
const { envValue } = require('../utils/foxcraft');
const { registerComponent, button, rows } = require('../utils/ui');

function isOwner(userId) {
    const ownerId = envValue('OWNER_ID');
    return Boolean(ownerId && userId && ownerId === userId);
}

function ownerReply(userId, deny = 'Bu paneldən yalnız bot sahibi istifadə edə bilər.') {
    if (isOwner(userId)) return null;
    return ephemeralReply(deny);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('restart')
        .setDescription('Botu yenidən başladır (yalnız sahib)'),
    async execute(interaction) {
        const userId = interaction.user?.id || interaction.member?.user?.id;
        const denied = ownerReply(userId);
        if (denied) return denied;
        const ownerReply = ephemeralReply('🔁 Bot yenidən başladılsın?');
        ownerReply.data.components = rows(
            button('foxcraft:restart-confirm', 'Bəli, yenidən başlat', 4, '🔁'),
            button('foxcraft:restart-cancel', 'Xeyr', 2, '✖️'),
        );
        return ownerReply;
    },
    async prefixExecute(message) {
        const denied = ownerReply(message.author.id);
        if (denied) return message.reply('Bu əmrdən yalnız bot sahibi istifadə edə bilər.');
        return message.reply({ content: '🔁 Bot yenidən başladılsın?', components: rows(
            button('foxcraft:restart-confirm', 'Bəli, yenidən başlat', 4, '🔁'),
            button('foxcraft:restart-cancel', 'Xeyr', 2, '✖️'),
        ) });
    },
};

registerComponent('foxcraft:restart-confirm', async (ctx) => {
    if (!isOwner(ctx.user?.id)) {
        await ctx.reply({ content: 'Bu paneldən yalnız bot sahibi istifadə edə bilər.', ephemeral: true });
        return;
    }
    await ctx.reply({ content: '🔁 Bot yenidən başladılır...', ephemeral: false });
    setTimeout(() => process.exit(0), 1200);
});

registerComponent('foxcraft:restart-cancel', async (ctx) => {
    await ctx.update({ content: 'Yenidən başlatma ləğv edildi. ✅', embeds: [], components: [] });
});