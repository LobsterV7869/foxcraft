/**
 * Unified button / select / modal interaction dispatcher that works through
 * BOTH the gateway (discord.js Interaction objects) and the HTTP interactions
 * endpoint (raw payloads). Modules register handlers for their customId
 * prefixes, and the dispatcher routes them with a common, backend-agnostic ctx.
 */

const {
    ActionRowBuilder,
    ModalBuilder,
    TextInputBuilder,
} = require('discord.js');

const { InteractionResponseType, InteractionResponseFlags } = require('discord-interactions');

const registry = [];

/**
 * Registers a component/modal handler.
 *   id: string customId prefix (matched exactly or with ":" suffix)
 *   handler: async (ctx) => void
 */
function registerComponent(id, handler) {
    registry.push({ id, handler });
}

function lookup(customId) {
    return registry.find((entry) => customId === entry.id || customId.startsWith(`${entry.id}:`));
}

// -- shared helpers -----------------------------------------------------------

function escaf(value) {
    return value == null ? '' : String(value);
}

function modalFromJson(json) {
    const modal = new ModalBuilder()
        .setCustomId(json.custom_id)
        .setTitle(json.title || 'Ayarlar');
    for (const row of json.components || []) {
        const inputs = (row.components || []).map((c) => {
            const builder = new TextInputBuilder()
                .setCustomId(c.custom_id)
                .setLabel(c.label || c.custom_id)
                .setStyle(c.style === 2 ? 2 : 1)
                .setRequired(Boolean(c.required))
                .setMaxLength(c.max_length || 4000);
            if (c.min_length) builder.setMinLength(c.min_length);
            if (c.placeholder) builder.setPlaceholder(String(c.placeholder));
            if (c.value) builder.setValue(String(c.value));
            return builder;
        });
        modal.addComponents(new ActionRowBuilder().addComponents(inputs));
    }
    return modal;
}

// -- Gateway backend ----------------------------------------------------------

class GatewayCtx {
    constructor(interaction, client) {
        this.interaction = interaction;
        this._modalShown = false;
        this._responded = false;
        this.client = client;
    }

    get customId() { return this.interaction.customId; }
    get values() { return this.interaction.values || []; }
    get user() { return this.interaction.user || this.interaction.member?.user || null; }
    get member() { return this.interaction.member || null; }
    get guildId() { return this.interaction.guildId || this.interaction.guild_id || null; }
    get channelId() { return this.interaction.channelId || this.interaction.channel_id || null; }
    get messageId() { return this.interaction.message?.id || null; }
    get token() { return this.interaction.token || null; }

    getTextInput(id) {
        try {
            return this.interaction.isModalSubmit() ? this.interaction.fields.getTextInputValue(id) : '';
        } catch {
            return '';
        }
    }

    async guild() {
        return this.interaction.guild || this.client.guilds.fetch(this.guildId);
    }

    async channel() {
        if (this.interaction.channel) return this.interaction.channel;
        return this.client.channels.fetch(this.channelId);
    }

    async reply(payload) {
        this._responded = true;
        const options = { ...payload };
        if (payload?.ephemeral === true) options.ephemeral = true;
        if (this.interaction.deferred || this.interaction.replied) {
            const { content, embeds, components, files } = options;
            await this.interaction.editReply({ content, embeds, components, files });
            return;
        }
        await this.interaction.reply(options);
    }

    async update(payload) {
        this._responded = true;
        const options = { ...payload };
        if (this.interaction.deferred || this.interaction.replied) {
            await this.interaction.editReply({ content: payload.content, embeds: payload.embeds, components: payload.components });
            return;
        }
        await this.interaction.update(options);
    }

    async defer(payload = {}) {
        this._responded = true;
        if (payload.ephemeral) {
            await this.interaction.deferReply({ ephemeral: true });
        } else {
            await this.interaction.deferUpdate();
        }
    }

    async showModal(json) {
        this._modalShown = true;
        this._responded = true;
        await this.interaction.showModal(modalFromJson(json));
    }

    async ack() {
        if (this._responded) return;
        try {
            await this.interaction.deferUpdate();
        } catch {
            /* already gone */
        }
    }
}

// -- HTTP backend -------------------------------------------------------------

class HttpCtx {
    constructor(payload, client) {
        this.payload = payload;
        this.client = client;
        this._response = null;
        this._responded = false;
    }

    get customId() { return this.payload.data?.custom_id || ''; }
    get values() { return this.payload.data?.values || []; }
    get user() { return this.payload.member?.user || this.payload.user || null; }
    get member() { return this.payload.member || null; }
    get guildId() { return this.payload.guild_id || null; }
    get channelId() { return this.payload.channel_id || null; }
    get messageId() { return this.payload.message?.id || null; }
    get token() { return this.payload.token || null; }

    getTextInput(id) {
        if (this.payload.type !== 5) return '';
        const row = (this.payload.data?.components || []).find((r) =>
            (r.components || []).some((c) => c.custom_id === id));
        return row ? (row.components.find((c) => c.custom_id === id)?.value || '') : '';
    }

    response() { return this._response; }

    setResponse(type, data) {
        this._response = { type, data };
    }

    async reply(payload) {
        this._responded = true;
        const data = { content: payload.content, embeds: payload.embeds, components: payload.components };
        if (payload.ephemeral) data.flags = InteractionResponseFlags.EPHEMERAL;
        this.setResponse(InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data);
    }

    async update(payload) {
        this._responded = true;
        const data = { content: payload.content, embeds: payload.embeds, components: payload.components };
        if (payload.ephemeral) data.flags = InteractionResponseFlags.EPHEMERAL;
        this.setResponse(InteractionResponseType.UPDATE_MESSAGE, data);
    }

    async defer(payload = {}) {
        this._responded = true;
        if (payload.ephemeral) {
            this.setResponse(InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE, {
                flags: InteractionResponseFlags.EPHEMERAL,
            });
        } else {
            this.setResponse(InteractionResponseType.DEFERRED_UPDATE, {});
        }
    }

    async showModal(json) {
        this._responded = true;
        this.setResponse(InteractionResponseType.MODAL, {
            custom_id: json.custom_id,
            title: json.title || 'Ayarlar',
            components: json.components || [],
        });
    }

    async ack() {
        if (this._responded) return;
        this.setResponse(InteractionResponseType.DEFERRED_UPDATE, {});
    }

    async guild() {
        return this.client.guilds.fetch(this.guildId);
    }

    async channel() {
        return this.client.channels.fetch(this.channelId);
    }
}

// -- dispatch -----------------------------------------------------------------

async function dispatch(ctx) {
    const entry = lookup(ctx.customId);
    if (!entry) return false;
    try {
        await entry.handler(ctx);
    } catch (error) {
        console.error(`[UI] ${ctx.customId} idarə olunarkən xəta:`, error.message);
        try {
            await ctx.reply({ content: 'Bu əməliyyat icra edilərkən xəta baş verdi.', ephemeral: true });
        } catch {
            /* best effort */
        }
    }
    await ctx.ack();
    return true;
}

/**
 * Entry point for the gateway interactionCreate handler. Returns true when a
 * registered component/modal consumed the interaction.
 */
async function handleGatewayInteraction(interaction, client) {
    if (!interaction?.customId) return false;
    const ctx = new GatewayCtx(interaction, client);
    return dispatch(ctx);
}

/**
 * Entry point for the HTTP interactions endpoint (MESSAGE_COMPONENT /
 * MODAL_SUBMIT). Returns a raw response to send back, or null when unhandled.
 */
async function handleHttpInteraction(payload, client) {
    const customId = payload?.data?.custom_id;
    if (!customId) return null;
    const ctx = new HttpCtx(payload, client);
    const handled = await dispatch(ctx);
    if (!handled) return null;
    const response = ctx.response();
    if (response) return response;
    return { type: InteractionResponseType.DEFERRED_UPDATE };
}

// Small shared builders used by handlers --------------------------------------

function button(id, label, style = 2, emoji) {
    return { type: 2, custom_id: id, label, style, ...(emoji ? { emoji: { name: emoji } } : {}) };
}

function select(customId, placeholder, options, minValues = 1, maxValues = 1) {
    return {
        type: 3,
        custom_id: customId,
        placeholder,
        min_values: minValues,
        max_values: maxValues,
        options: options.map((option) => ({
            label: String(option.label).slice(0, 100),
            value: String(option.value).slice(0, 100),
            ...(option.description ? { description: String(option.description).slice(0, 100) } : {}),
            ...(option.emoji ? { emoji: { name: option.emoji } } : {}),
        })),
    };
}

function rows(...components) {
    return components.filter(Boolean).map((component) => ({
        type: 1,
        components: Array.isArray(component) ? component : [component],
    }));
}

module.exports = {
    registerComponent,
    handleGatewayInteraction,
    handleHttpInteraction,
    escaf,
    button,
    select,
    rows,
};