const { SlashCommandBuilder } = require('discord.js');
const { ephemeralReply } = require('../utils/interaction');
const { envValue } = require('../utils/foxcraft');
const { registerComponent, button, rows } = require('../utils/ui');

const { t } = require('../utils/lang');

function isOwner(userId) {
    const ownerId = envValue('OWNER_ID');
    return Boolean(ownerId && userId && ownerId === userId);
}

function ownerReply(userId, deny = t(null, 'owner_only_panel')) {
    if (isOwner(userId)) return null;
    return ephemeralReply(deny);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('restart')
        .setDescription('Restarts the bot (owner only)'),
    async execute(interaction) {
        const userId = interaction.user?.id || interaction.member?.user?.id;
        const denied = ownerReply(userId);
        if (denied) return denied;
        const ownerReply = ephemeralReply(t(interaction.guild_id, 'restart_confirm'));
        ownerReply.data.components = rows(
            button('foxcraft:restart-confirm', t(interaction.guild_id, 'restart_yes'), 4, null),
            button('foxcraft:restart-cancel', 'Xeyr', 2, '✖️'),
        );
        return ownerReply;
    },
    async prefixExecute(message) {
        const denied = ownerReply(message.author.id);
        if (denied) return message.reply(t(message.guild?.id, 'perm_owner_only'));
        return message.reply({ content: t(message.guild?.id, 'restart_confirm'), components: rows(
            button('foxcraft:restart-confirm', t(message.guild?.id, 'restart_yes'), 4, null),
            button('foxcraft:restart-cancel', 'Xeyr', 2, '✖️'),
        ) });
    },
};

registerComponent('foxcraft:restart-confirm', async (ctx) => {
    if (!isOwner(ctx.user?.id)) {
        await ctx.reply({ content: t(message.guild?.id, 'perm_panel_owner'), ephemeral: true });
        return;
    }
    await ctx.reply({ content: t(message.guild?.id, 'panel_restarting'), ephemeral: false });
    setTimeout(() => process.exit(0), 1200);
});

registerComponent('foxcraft:restart-cancel', async (ctx) => {
    await ctx.update({ content: t(message.guild?.id, 'panel_restart_cancelled'), embeds: [], components: [] });
});