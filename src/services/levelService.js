const mongoose = require("mongoose");
const User = require("../models/User");
const { XP_PER_LEVEL } = require("../config/xp");

function validateLevel(level) {
    if (!Number.isInteger(level) || level < 1) {
        throw new Error("Invalid level");
    }
}

function validateXpAmount(amount) {
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) {
        throw new Error("Invalid XP amount");
    }
}

function validateUserId(userId) {
    if (typeof userId !== "string" || userId.trim() === "") {
        throw new Error("Invalid Instagram ID");
    }

    return userId.trim();
}

function getXpRequiredForNextLevel(level) {
    validateLevel(level);
    return XP_PER_LEVEL * level;
}

function getLevelProgress(level, xp) {
    validateLevel(level);
    validateXpAmount(xp);
    const requiredXp = getXpRequiredForNextLevel(level);

    return {
        level,
        xp,
        requiredXp,
        xpToNextLevel: Math.max(0, requiredXp - xp)
    };
}

async function runWithSession(operation, suppliedSession) {
    if (suppliedSession) {
        return operation(suppliedSession);
    }

    const session = await mongoose.startSession();
    try {
        return await session.withTransaction(() => operation(session));
    } finally {
        await session.endSession();
    }
}

async function addProgressXp(userId, amount, xpField, levelField, session = null) {
    validateXpAmount(amount);
    const instagramId = validateUserId(userId);

    return runWithSession(async (transactionSession) => {
        const user = await User.findOne({ instagramId }).session(transactionSession);
        if (!user) {
            throw new Error("User not found");
        }

        let xp = user[xpField] + amount;
        let level = user[levelField];
        if (!Number.isFinite(xp)) {
            throw new Error("XP total is too large");
        }

        while (xp >= getXpRequiredForNextLevel(level)) {
            xp -= getXpRequiredForNextLevel(level);
            level += 1;
        }

        return User.findOneAndUpdate(
            { _id: user._id },
            { $set: { [xpField]: xp, [levelField]: level } },
            { returnDocument: "after", runValidators: true, session: transactionSession }
        );
    }, session);
}

function addUserXp(userId, amount, session = null) {
    return addProgressXp(userId, amount, "xp", "level", session);
}

function addWorkXp(userId, amount, session = null) {
    return addProgressXp(userId, amount, "workXp", "workLevel", session);
}

module.exports = {
    getXpRequiredForNextLevel,
    addUserXp,
    addWorkXp,
    getLevelProgress
};