const mongoose = require("mongoose");

const marriageSchema = new mongoose.Schema(
    {
        user1Id: {
            type: String,
            required: true,
            trim: true
        },

        user2Id: {
            type: String,
            required: true,
            trim: true
        },

        ringItemId: {
            type: String,
            required: true,
            trim: true
        },

        marriedAt: {
            type: Date,
            default: Date.now
        },

        status: {
            type: String,
            enum: ["married", "divorced"],
            default: "married",
            index: true
        },

        divorcedAt: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: true
    }
);

// Prevent duplicate active marriages.
marriageSchema.index(
    { user1Id: 1 },
    {
        unique: true,
        partialFilterExpression: {
            status: "married"
        }
    }
);

marriageSchema.index(
    { user2Id: 1 },
    {
        unique: true,
        partialFilterExpression: {
            status: "married"
        }
    }
);

module.exports = mongoose.model(
    "Marriage",
    marriageSchema
);