const mongoose = require("mongoose");

const marriageProposalSchema = new mongoose.Schema(
    {
        proposerId: {
            type: String,
            required: true,
            trim: true
        },

        targetId: {
            type: String,
            required: true,
            trim: true
        },

        ringItemId: {
            type: String,
            required: true,
            trim: true
        },

        status: {
            type: String,
            enum: [
                "pending",
                "accepted",
                "rejected",
                "expired"
            ],
            default: "pending",
            index: true
        },

        expiresAt: {
            type: Date,
            required: true,
            index: true
        }
    },
    {
        timestamps: true
    }
);

// Only one pending outgoing proposal per proposer.
marriageProposalSchema.index(
    { proposerId: 1 },
    {
        unique: true,
        partialFilterExpression: {
            status: "pending"
        }
    }
);

// Only one pending incoming proposal per target.
marriageProposalSchema.index(
    { targetId: 1 },
    {
        unique: true,
        partialFilterExpression: {
            status: "pending"
        }
    }
);

// Automatically remove old proposal documents.
marriageProposalSchema.index(
    { expiresAt: 1 },
    {
        expireAfterSeconds: 0
    }
);

module.exports = mongoose.model(
    "MarriageProposal",
    marriageProposalSchema
);