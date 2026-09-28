const { SlashCommandBuilder } = require('discord.js');
const { ephemeralReply, getStringOption, autocompleteContext } = require('../utils/interaction');
const { buildCategoryEmbed, buildSelect, commandDetail, resolveCategory, loadCommands, CATEGORIES } = require('../utils/helpdata');
const { registerComponent, rows } = require('../utils/ui');

const DEFAULT_CATEGORY = 'istifadeci';

function buildPayload(guildId, member, category = DEFAULT_CATEGORY) {
    return {
        embeds: [buildCategoryEmbed(category, guildId, member)],
        components: rows(buildSelect()),
    };
}

/** `!help <əmr>` for a single command, otherwise the category menu. */
async function resolvePrefixReply(guildId, member, input) {
    const detail = input ? commandDetail(input, guildId, member) : null;
    if (detail) return { embeds: [detail], components: rows(buildSelect()) };
    return buildPayload(guildId, member, resolveCategory(input) || DEFAULT_CATEGORY);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Bütün əmrlərin siyahısı və kömək menyusu')
        .addStringOption((option) =>
            option
                .setName('kateqoriya')
                .setDescription('Kateqoriya və ya əmrin adı')
                .setAutocomplete(true),
        ),
    async execute(interaction) {
        const input = getStringOption(interaction, 'kateqoriya');
        const member = interaction.member;
        const res = ephemeralReply(null, [buildCategoryEmbed(DEFAULT_CATEGORY, interaction.guild_id, member)]);
        if (input) {
            const detail = commandDetail(input, interaction.guild_id, member);
            if (detail) {
                res.data.embeds = [detail];
            } else {
                const category = resolveCategory(input);
                if (category) res.data.embeds = [buildCategoryEmbed(category, interaction.guild_id, member)];
            }
        }
        res.data.components = rows(buildSelect());
        return res;
    },
    async autocomplete(interaction) {
        const ctx = autocompleteContext(interaction);
        const focused = String(ctx.options.getFocused() || '').toLowerCase();
        const suggestions = CATEGORIES.map((c) => ({ name: c.title, value: c.id }))
            .concat(Object.values(loadCommands()).map((c) => ({ name: `/${c.name}`, value: c.name })))
            .filter((s) => s.value.includes(focused) || s.name.toLowerCase().includes(focused))
            .slice(0, 25);
        return ctx.respond(suggestions);
    },
    async prefixExecute(message, args = []) {
        return message.reply(await resolvePrefixReply(message.guild.id, message.member, args[0]));
    },
};

registerComponent('foxcraft:help-cat', async (ctx) => {
    const category = resolveCategory(ctx.values[0]) || DEFAULT_CATEGORY;
    const guild = ctx.guildId ? await ctx.guild().catch(() => null) : null;
    let member = ctx.member;
    if (guild && ctx.user?.id) {
        member = await guild.members.fetch(ctx.user.id).catch(() => member);
    }
    await ctx.update(buildPayload(ctx.guildId, member, category));
});
