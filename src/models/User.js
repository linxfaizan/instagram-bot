const mongoose = require("mongoose");

function getDefaultCoins() {
    const configuredCoins = Number(process.env.DEFAULT_COINS ?? 100);
    return Number.isFinite(configuredCoins) && configuredCoins >= 0 ? configuredCoins : 100;
}

const userSchema = new mongoose.Schema(
    {
        instagramId: {
            type: String,
            required: true,
            unique: true,
            trim: true
        },
        username: {
            type: String,
            default: null,
            trim: true
        },
        coins: {
            type: Number,
            default: getDefaultCoins,
            min: 0
        },
        bank: {
            type: Number,
            default: 0,
            min: 0
        },
        xp: {
            type: Number,
            default: 0,
            min: 0
        },
        level: {
            type: Number,
            default: 1,
            min: 1
        },
        workXp: {
            type: Number,
            default: 0,
            min: 0
        },
        workLevel: {
            type: Number,
            default: 1,
            min: 1
        },
        job: {
            type: String,
            default: null
        },
        workStartedAt: {
            type: Date,
            default: null
        },
        jobSelectionPending: {
            type: Boolean,
            default: false
        },
        inventory: {
            type: [mongoose.Schema.Types.Mixed],
            default: () => []
        },
        cooldowns: {
            type: Map,
            of: Date,
            default: () => new Map()
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);