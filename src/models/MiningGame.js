const mongoose = require("mongoose");

const { miningConfig } = require("../config/mining");

const miningGameSchema = new mongoose.Schema(
    {
        instagramId: {
            type: String,
            required: true,
            trim: true
        },

        bet: {
            type: Number,
            required: true,
            min: 1,
            validate: Number.isSafeInteger
        },

        bombPositions: {
            type: [Number],
            required: true,
            validate: {
                validator(positions) {
                    return (
                        Array.isArray(positions) &&
                        positions.length === miningConfig.BOMBS &&
                        positions.every(
                            (position) =>
                                Number.isSafeInteger(position) &&
                                position >= 1 &&
                                position <= miningConfig.BOARD_SIZE
                        ) &&
                        new Set(positions).size === positions.length
                    );
                },
                message: "Invalid mining bomb positions"
            }
        },

        revealedTiles: {
            type: [Number],
            default: () => [],
            validate: {
                validator(positions) {
                    return (
                        Array.isArray(positions) &&
                        positions.every(
                            (position) =>
                                Number.isSafeInteger(position) &&
                                position >= 1 &&
                                position <= miningConfig.BOARD_SIZE
                        ) &&
                        new Set(positions).size === positions.length
                    );
                },
                message: "Invalid mining revealed tiles"
            }
        },

        safeMines: {
            type: Number,
            default: 0,
            min: 0,
            max: miningConfig.MAX_SAFE_MINES,
            validate: Number.isSafeInteger
        },

        currentMultiplier: {
            type: Number,
            default: 1,
            min: 1
        },

        status: {
            type: String,
            enum: ["active", "cashed_out", "lost", "completed"],
            default: "active",
            index: true
        },

        payout: {
            type: Number,
            default: null,
            min: 1,
            validate: (value) =>
                value === null || Number.isSafeInteger(value)
        },

        endedAt: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: true
    }
);

/*
 * Only one ACTIVE mining game per Instagram user.
 *
 * IMPORTANT:
 * Do not add `index: true` to instagramId above.
 * This partial unique index is the only instagramId index needed.
 */
miningGameSchema.index(
    { instagramId: 1 },
    {
        unique: true,
        partialFilterExpression: {
            status: "active"
        }
    }
);

module.exports = mongoose.model("MiningGame", miningGameSchema);