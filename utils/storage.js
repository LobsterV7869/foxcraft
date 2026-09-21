const mongoose = require('mongoose');

// MongoDB Schema for Minecraft Links
const MinecraftLinkSchema = new mongoose.Schema({
    discordUserId: { type: String, required: true, unique: true },
    minecraftUsername: { type: String, required: true },
    updatedAt: { type: Date, default: Date.now }
});

// MongoDB Schema for Game State
const GameStateSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    channelId: { type: String, required: true },
    game: { type: String, required: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
    updatedAt: { type: Date, default: Date.now }
});

// Index to ensure unique state per guild/channel/game (like the PRIMARY KEY in SQLite)
GameStateSchema.index({ guildId: 1, channelId: 1, game: 1 }, { unique: true });

const MinecraftLink = mongoose.model('MinecraftLink', MinecraftLinkSchema);
const GameState = mongoose.model('GameState', GameStateSchema);

async function connectDB() {
    try {
        const uri = process.env.MONGO_URI;
        if (!uri) {
            console.error('[STORAGE] MONGO_URI is missing in .env file!');
            return;
        }
        await mongoose.connect(uri);
        console.log('[STORAGE] Successfully connected to MongoDB Atlas');
    } catch (error) {
        console.error('[STORAGE] MongoDB connection error:', error.message);
    }
}

// Export connection function to be called in index.js
module.exports = {
    connectDB,
    setMinecraftLink: async (discordUserId, minecraftUsername) => {
        try {
            await MinecraftLink.findOneAndUpdate(
                { discordUserId },
                { minecraftUsername, updatedAt: new Date() },
                { upsert: true, new: true }
            );
        } catch (error) {
            console.error('[STORAGE] Error setting Minecraft link:', error.message);
        }
    },
    getMinecraftLink: async (discordUserId) => {
        try {
            const link = await MinecraftLink.findOne({ discordUserId });
            return link?.minecraftUsername || null;
        } catch (error) {
            console.error('[STORAGE] Error getting Minecraft link:', error.message);
            return null;
        }
    },
    getGameState: async (guildId, channelId, game, fallback) => {
        try {
            const state = await GameState.findOne({ guildId, channelId, game });
            return state ? state.value : fallback;
        } catch (error) {
            console.error('[STORAGE] Error getting game state:', error.message);
            return fallback;
        }
    },
    setGameState: async (guildId, channelId, game, value) => {
        try {
            await GameState.findOneAndUpdate(
                { guildId, channelId, game },
                { value, updatedAt: new Date() },
                { upsert: true, new: true }
            );
        } catch (error) {
            console.error('[STORAGE] Error setting game state:', error.message);
        }
    },
};
