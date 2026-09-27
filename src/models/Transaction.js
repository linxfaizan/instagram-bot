const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
    from: {
        type: String,
        default: null
    },
    to: {
        type: String,
        default: null
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    type: {
        type: String,
        required: true,
        trim: true
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: () => ({})
    },
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    }
});

transactionSchema.index({ to: 1, timestamp: -1 });
transactionSchema.index({ from: 1, timestamp: -1 });

module.exports = mongoose.model("Transaction", transactionSchema);