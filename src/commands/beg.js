const mongoose = require("mongoose");
const User = require("../models/User");
const { getOrCreateUser } = require("../services/userService");
const { addCoins } = require("../services/economyService");
const { addUserXp } = require("../services/levelService");
const { BEG_XP } = require("../config/xp");
const { readBegConfig, validateBegConfig } = require("../config/beg");
const { formatNumber } = require("../utils/formatNumber");
const { markCommandNotAccepted } = require("../services/rateLimitService");

function formatRemainingTime(milliseconds) {
    const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function generateReward(minReward, maxReward) {
    const maximumOffset = maxReward - minReward;
    const offset = Math.min(maximumOffset, Math.floor(Math.random() * (maximumOffset + 1)));
    return offset + minReward;
}

async function begCommand({ message }) {
    const config = validateBegConfig(readBegConfig());
    const instagramId = message.userId.trim();
    const now = new Date(Date.now());
    const nextClaimAt = new Date(now.getTime() + config.cooldownSeconds * 1000);
    if (!Number.isFinite(nextClaimAt.getTime())) {
        throw new Error("Invalid beg configuration");
    }

    await getOrCreateUser(instagramId, message.username);

    const session = await mongoose.startSession();
    let claimResult;

    try {
        claimResult = await session.withTransaction(async () => {
            const claimedUser = await User.findOneAndUpdate(
                {
                    instagramId,
                    $or: [
                        { "cooldowns.beg": { $exists: false } },
                        { "cooldowns.beg": { $lte: now } }
                    ]
                },
                { $set: { "cooldowns.beg": nextClaimAt } },
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
                    nextClaimAt: currentUser.cooldowns.get("beg")
                };
            }

            const reward = generateReward(config.minReward, config.maxReward);
            if (!Number.isSafeInteger(reward) || reward <= 0) {
                throw new Error("Invalid beg reward");
            }

            const updatedUser = await addCoins(
                instagramId,
                reward,
                "beg",
                { minReward: config.minReward, maxReward: config.maxReward },
                session
            );
            await addUserXp(instagramId, BEG_XP, session);

            return { claimed: true, balance: updatedUser.coins, reward };
        });
    } finally {
        await session.endSession();
    }

    if (!claimResult.claimed) {
        return markCommandNotAccepted({
            type: "text",
            text: `⏳ You can beg again in ${formatRemainingTime(
                claimResult.nextClaimAt.getTime() - Date.now()
            )}.`
        });
    }

    return {
        type: "text",
        text: `🥺 You begged someone for money...\n\n💰 You received ${formatNumber(claimResult.reward)} coins!\n✨ +${BEG_XP} XP\n\n⏳ You can beg again in ${formatRemainingTime(nextClaimAt.getTime() - Date.now())}.`
    };
}

module.exports = begCommand;
module.exports.generateReward = generateReward;
module.exports.formatRemainingTime = formatRemainingTime;