const { SlashCommandBuilder } = require('discord.js');
const { ephemeralReply } = require('../utils/interaction');
const { buildCategoryEmbed, buildSelect } = require('../utils/helpdata');
const { registerComponent, rows } = require('../utils/ui');

function payload(guildId, member, category = 'istifadeci') {
    return {
        embeds: [buildCategoryEmbed(category, guildId, member)],
        components: rows(buildSelect()),
    };
}

module.exports = {
    data: new SlashCommandBuilder().setName('help').setDescription('Bütün əmrlərin siyahısı və kömək menyusu'),
    async execute(interaction) {
        const res = ephemeralReply(null, [buildCategoryEmbed('istifadeci', interaction.guild_id, interaction.member)]);
        res.data.components = rows(buildSelect());
        return res;
    },
    async prefixExecute(message) {
        return message.reply(payload(message.guild.id, message.member));
    },
};

registerComponent('foxcraft:help-cat', async (ctx) => {
    const category = ctx.values[0] || 'istifadeci';
    const guild = ctx.guildId ? await ctx.guild().catch(() => null) : null;
    let member = ctx.member;
    if (guild && ctx.user?.id) {
        member = await guild.members.fetch(ctx.user.id).catch(() => member);
    }
    await ctx.update({
        embeds: [buildCategoryEmbed(category, ctx.guildId, member)],
        components: rows(buildSelect()),
    });
});