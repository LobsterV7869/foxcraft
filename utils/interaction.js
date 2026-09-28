/**
 * Helpers for parsing Discord HTTP interaction payloads and constructing responses.
 */

const { InteractionResponseType, InteractionResponseFlags } = require('discord-interactions');

/**
 * Extracts the user object from an interaction (handles both Guild and DM/Group DM contexts).
 */
function getUser(interaction) {
    return interaction.user || interaction.member?.user || { id: 'unknown', username: 'Unknown User' };
}

/**
 * Extracts an option value by name from the interaction options array.
 * Also searches one level deep into subcommand options.
 */
function getOption(interaction, name) {
    const options = interaction.data?.options;
    if (!options || !Array.isArray(options)) return null;
    const direct = options.find((o) => o.name === name);
    if (direct) return direct.value;
    for (const option of options) {
        if (Array.isArray(option?.options)) {
            const nested = option.options.find((o) => o.name === name);
            if (nested) return nested.value;
        }
    }
    return null;
}

/**
 * Reads a string option in a backend-agnostic way.
 * The gateway gives us discord.js option resolvers, HTTP gives us raw JSON.
 */
function getStringOption(interaction, name) {
    const raw = getOption(interaction, name);
    if (raw === null || raw === undefined) return null;
    return typeof raw === 'string' ? raw : String(raw);
}

/**
 * Normalises an autocomplete interaction so command code can always call
 * `ctx.options.getFocused()` and `ctx.respond(choices)`.
 */
function autocompleteContext(interaction) {
    if (typeof interaction?.respond === 'function') return interaction;
    const focused = interaction?.data?.options?.find((o) => o.focused)?.value || '';
    return {
        options: { getFocused: () => focused },
        respond: (choices) => ({
            type: InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
            data: { choices: (choices || []).slice(0, 25) },
        }),
    };
}

/**
 * Creates an interaction response that is visible to everyone in the channel.
 */
function publicReply(content, embeds = null) {
    const data = {};
    if (content) data.content = content;
    if (embeds && Array.isArray(embeds)) data.embeds = embeds;
    return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data
    };
}

/**
 * Creates an interaction response visible ONLY to the user who invoked it (ephemeral).
 */
function ephemeralReply(content, embeds = null) {
    const res = publicReply(content, embeds);
    res.data.flags = InteractionResponseFlags.EPHEMERAL;
    return res;
}

module.exports = {
    getUser,
    getOption,
    getStringOption,
    autocompleteContext,
    publicReply,
    ephemeralReply
};
