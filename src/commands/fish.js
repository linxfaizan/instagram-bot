const mongoose = require("mongoose");
const User = require("../models/User");
const { getOrCreateUser, addInventoryItem } = require("../services/userService");
const { addUserXp } = require("../services/levelService");
const { FISH_XP } = require("../config/xp");
const {
    fishTypes,
    getFishCooldownSeconds,
    selectFish
} = require("../config/fish");
const { formatRemainingTime } = require("./beg");
const { markCommandNotAccepted } = require("../services/rateLimitService");

function createFishCommand(selectFishFn = selectFish) {
    return async function fishCommand({ message, args }) {
        if (Array.isArray(args) && args.length > 0) {
            return {
                type: "text",
                text: "❌ Usage: /fish"
            };
        }

        const cooldownSeconds = getFishCooldownSeconds();
        const cooldownMilliseconds = cooldownSeconds * 1000;
        const instagramId = message.userId.trim();
        const now = new Date(Date.now());
        const nextClaimAt = new Date(now.getTime() + cooldownMilliseconds);
        if (!Number.isFinite(nextClaimAt.getTime())) {
            throw new Error("Invalid fish cooldown configuration");
        }

        await getOrCreateUser(instagramId, message.username);

        const session = await mongoose.startSession();
        let catchResult;

        try {
            catchResult = await session.withTransaction(async () => {
                const claimedUser = await User.findOneAndUpdate(
                    {
                        instagramId,
                        $or: [
                            { "cooldowns.fish": { $exists: false } },
                            { "cooldowns.fish": { $lte: now } }
                        ]
                    },
                    { $set: { "cooldowns.fish": nextClaimAt } },
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
                        caught: false,
                        nextClaimAt: currentUser.cooldowns.get("fish")
                    };
                }

                const caughtFish = selectFishFn();
                const configuredFish = fishTypes.find((fish) => fish.itemId === caughtFish?.itemId);
                if (!configuredFish || configuredFish !== caughtFish) {
                    throw new Error("Fish selector returned an unconfigured fish");
                }

                await addInventoryItem(instagramId, configuredFish.itemId, session);
                await addUserXp(instagramId, FISH_XP, session);

                return { caught: true, fish: configuredFish };
            });
        } finally {
            await session.endSession();
        }

        if (!catchResult.caught) {
            return markCommandNotAccepted({
                type: "text",
                text: `⏳ You can fish again in ${formatRemainingTime(
                    catchResult.nextClaimAt.getTime() - Date.now()
                )}.`
            });
        }

        const rarity = `${catchResult.fish.rarity[0].toUpperCase()}${catchResult.fish.rarity.slice(1)}`;
        return {
            type: "text",
            text: `🎣 You cast your fishing rod...\n\n${catchResult.fish.emoji} You caught a ${catchResult.fish.name}!\n\n⭐ Rarity: ${rarity}\n✨ +${FISH_XP} XP\n\n⏳ You can fish again in ${formatRemainingTime(
                nextClaimAt.getTime() - Date.now()
            )}.`
        };
    };
}

const fishCommand = createFishCommand();
module.exports = fishCommand;
module.exports.createFishCommand = createFishCommand;
