const mongoose = require("mongoose");
const User = require("../models/User");
const Transaction = require("../models/Transaction");

function normalizeInstagramId(instagramId) {
    if (typeof instagramId !== "string" || instagramId.trim() === "") {
        throw new Error("Invalid Instagram ID");
    }

    return instagramId.trim();
}

function validateAmount(amount) {
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
        throw new Error("Invalid amount");
    }
}

function validateTransactionType(transactionType) {
    if (typeof transactionType !== "string" || transactionType.trim() === "") {
        throw new Error("Invalid transaction type");
    }

    return transactionType.trim();
}

async function withTransaction(operation) {
    const session = await mongoose.startSession();

    try {
        return await session.withTransaction(() => operation(session));
    } finally {
        await session.endSession();
    }
}

async function getBalance(instagramId) {
    const user = await User.findOne({ instagramId: normalizeInstagramId(instagramId) })
        .select("coins bank")
        .lean();

    if (!user) {
        throw new Error("User not found");
    }

    return { coins: user.coins, bank: user.bank };
}

async function addCoins(instagramId, amount, transactionType, metadata, session = null) {
    validateAmount(amount);
    const normalizedId = normalizeInstagramId(instagramId);
    const normalizedType = validateTransactionType(transactionType);

    const addCoinsOperation = async (transactionSession) => {
        const user = await User.findOneAndUpdate(
            { instagramId: normalizedId },
            { $inc: { coins: amount } },
            { returnDocument: "after", runValidators: true, session: transactionSession }
        );

        if (!user) {
            throw new Error("User not found");
        }

        await Transaction.create(
            [{ from: null, to: normalizedId, amount, type: normalizedType, metadata: metadata || {} }],
            { session: transactionSession }
        );

        return user;
    };

    return session ? addCoinsOperation(session) : withTransaction(addCoinsOperation);
}

async function removeCoins(instagramId, amount, transactionType, metadata) {
    validateAmount(amount);
    const normalizedId = normalizeInstagramId(instagramId);
    const normalizedType = validateTransactionType(transactionType);

    return withTransaction(async (session) => {
        const userExists = await User.exists({ instagramId: normalizedId }).session(session);
        if (!userExists) {
            throw new Error("User not found");
        }

        const user = await User.findOneAndUpdate(
            { instagramId: normalizedId, coins: { $gte: amount } },
            { $inc: { coins: -amount } },
            { returnDocument: "after", runValidators: true, session }
        );

        if (!user) {
            throw new Error("Insufficient coins");
        }

        await Transaction.create(
            [{ from: normalizedId, to: null, amount, type: normalizedType, metadata: metadata || {} }],
            { session }
        );

        return user;
    });
}

async function transferCoins(fromInstagramId, toInstagramId, amount, metadata, session = null) {
    validateAmount(amount);
    const fromId = normalizeInstagramId(fromInstagramId);
    const toId = normalizeInstagramId(toInstagramId);

    if (fromId === toId) {
        throw new Error("Cannot transfer coins to yourself");
    }

    const transferOperation = async (transactionSession) => {
        const senderExists = await User.exists({ instagramId: fromId }).session(transactionSession);
        const recipientExists = await User.exists({ instagramId: toId }).session(transactionSession);
        if (!senderExists || !recipientExists) {
            throw new Error("User not found");
        }

        const sender = await User.findOneAndUpdate(
            { instagramId: fromId, coins: { $gte: amount } },
            { $inc: { coins: -amount } },
            { returnDocument: "after", runValidators: true, session: transactionSession }
        );

        if (!sender) {
            throw new Error("Insufficient coins");
        }

        const recipient = await User.findOneAndUpdate(
            { instagramId: toId },
            { $inc: { coins: amount } },
            { returnDocument: "after", runValidators: true, session: transactionSession }
        );

        if (!recipient) {
            throw new Error("User not found");
        }

        await Transaction.create(
            [{ from: fromId, to: toId, amount, type: "pay", metadata: metadata || {} }],
            { session: transactionSession }
        );

        return {
            from: { instagramId: fromId, coins: sender.coins, bank: sender.bank },
            to: { instagramId: toId, coins: recipient.coins, bank: recipient.bank }
        };
    };

    return session ? transferOperation(session) : withTransaction(transferOperation);
}

module.exports = { getBalance, addCoins, removeCoins, transferCoins };