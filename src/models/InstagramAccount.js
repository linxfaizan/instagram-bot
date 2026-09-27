const mongoose = require("mongoose");

const instagramAccountSchema = new mongoose.Schema(
    {
        instagramUserId: {
            type: String,
            required: true,
            unique: true,
            index: true
        },

        accessToken: {
            type: String,
            required: true
        },

        tokenExpiresAt: {
            type: Date,
            required: true
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model(
    "InstagramAccount",
    instagramAccountSchema
);

