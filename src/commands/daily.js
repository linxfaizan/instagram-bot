const mongoose = require("mongoose");
const User = require("../models/User");
const { getOrCreateUser } = require("../services/userService");
const { addCoins } = require("../services/economyService");
const { addUserXp } = require("../services/levelService");
const { DAILY_XP } = require("../config/xp");
const { markCommandNotAccepted } = require("../services/rateLimitService");

function formatRemainingTime(milliseconds) {
    const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));

    if (totalSeconds < 60) {
        return `${totalSeconds}s`;
    }

    const totalMinutes = Math.floor(totalSeconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return hours > 0 ? `${hours}h ${minutes}m` : `${totalMinutes}m`;
}

async function dailyCommand({ message }) {
    const reward = Number(process.env.DAILY_REWARD);
    const cooldownSeconds = Number(process.env.DAILY_COOLDOWN);
    const cooldownMilliseconds = cooldownSeconds * 1000;

    if (
        !Number.isFinite(reward) ||
        reward <= 0 ||
        !Number.isFinite(cooldownSeconds) ||
        cooldownSeconds < 0 ||
        !Number.isFinite(cooldownMilliseconds)
    ) {
        throw new Error("Invalid daily reward configuration");
    }

    const instagramId = message.userId.trim();
    await getOrCreateUser(instagramId, message.username);

    const now = new Date(Date.now());
    const nextClaimAt = new Date(now.getTime() + cooldownMilliseconds);
    if (!Number.isFinite(nextClaimAt.getTime())) {
        throw new Error("Invalid daily reward configuration");
    }

    const session = await mongoose.startSession();
    let claimResult;

    try {
        claimResult = await session.withTransaction(async () => {
            const claimedUser = await User.findOneAndUpdate(
                {
                    instagramId,
                    $or: [
                        { "cooldowns.daily": { $exists: false } },
                        { "cooldowns.daily": { $lte: now } }
                    ]
                },
                { $set: { "cooldowns.daily": nextClaimAt } },
                { returnDocument: "after", session }
            );

            if (!claimedUser) {
                const currentUser = await User.findOne({ instagramId })
                    .select("cooldowns")
                    .session(session);

                if (!currentUser) {
                    throw new Error("User not found");
                }

                return {
                    claimed: false,
                    nextClaimAt: currentUser.cooldowns.get("daily")
                };
            }

            const updatedUser = await addCoins(
                instagramId,
                reward,
                "daily",
                message.messageId ? { messageId: message.messageId } : {},
                session
            );
            await addUserXp(instagramId, DAILY_XP, session);

            return {
                claimed: true,
                balance: updatedUser.coins
            };
        });
    } finally {
        await session.endSession();
    }

    if (!claimResult.claimed) {
        const remainingTime = formatRemainingTime(
            claimResult.nextClaimAt.getTime() - Date.now()
        );

        return markCommandNotAccepted({
            type: "text",
            text: `⏳ Daily already claimed!\n\nCome back in ${remainingTime}.`
        });
    }

    return {
        type: "text",
        text: `🎁 Daily Reward\n\nYou received ${reward} coins! 💰\n\nBalance: ${claimResult.balance} coins\n\nCome back tomorrow!`
    };
}

module.exports = dailyCommand;