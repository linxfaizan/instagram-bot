require("dotenv").config();

const assert = require("node:assert/strict");
const { test } = require("node:test");
const mongoose = require("mongoose");
const connectDatabase = require("../src/config/database");
const User = require("../src/models/User");
const Transaction = require("../src/models/Transaction");
const { handleMessage } = require("./handleMessage");
const { DAILY_XP } = require("../src/config/xp");

const testInstagramId = "eco-bot-daily-test-user";
const claimMessageIds = [
    "eco-bot-daily-claim-first",
    "eco-bot-daily-claim-duplicate",
    "eco-bot-daily-claim-after-expiry",
    "eco-bot-daily-claim-race-a",
    "eco-bot-daily-claim-race-b"
];

function dailyMessage(messageId) {
    return {
        platform: "instagram",
        userId: testInstagramId,
        username: "eco_bot_daily_test",
        messageId,
        text: "/daily",
        timestamp: Date.now()
    };
}

test("/daily rewards once per cooldown and allows a claim after expiration", async () => {
    const reward = Number(process.env.DAILY_REWARD);
    const cooldownMilliseconds = Number(process.env.DAILY_COOLDOWN) * 1000;
    let ownsTestUserId = false;

    try {
        await connectDatabase();
        assert.equal(mongoose.connection.readyState, 1, "MongoDB should be connected");

        const existingUser = await User.findOne({ instagramId: testInstagramId });
        assert.equal(existingUser, null, "daily test Instagram ID must not already exist");
        ownsTestUserId = true;

        const initialCoins = Number(process.env.DEFAULT_COINS ?? 100);
        const firstResponse = await handleMessage(dailyMessage(claimMessageIds[0]));
        assert.equal(firstResponse.type, "text");
        assert.ok(firstResponse.text.includes(`You received ${reward} coins!`));
        assert.ok(firstResponse.text.includes(`Balance: ${initialCoins + reward} coins`));

        const userAfterFirstClaim = await User.findOne({ instagramId: testInstagramId });
        assert.equal(userAfterFirstClaim.coins, initialCoins + reward);
        assert.equal(userAfterFirstClaim.xp, DAILY_XP);

        const firstCooldown = userAfterFirstClaim.cooldowns.get("daily");
        assert.ok(firstCooldown instanceof Date);
        assert.ok(firstCooldown.getTime() >= Date.now() + cooldownMilliseconds - 5000);
        assert.ok(firstCooldown.getTime() <= Date.now() + cooldownMilliseconds);

        const firstTransactions = await Transaction.find({
            to: testInstagramId,
            type: "daily",
            "metadata.messageId": claimMessageIds[0]
        });
        assert.equal(firstTransactions.length, 1);
        assert.equal(firstTransactions[0].amount, reward);

        const duplicateResponse = await handleMessage(dailyMessage(claimMessageIds[1]));
        assert.ok(duplicateResponse.text.includes("Daily already claimed!"));
        assert.match(duplicateResponse.text, /Come back in \d+[hms]/);

        const userAfterDuplicate = await User.findOne({ instagramId: testInstagramId });
        assert.equal(userAfterDuplicate.coins, initialCoins + reward);
        assert.equal(userAfterDuplicate.xp, DAILY_XP);
        assert.equal(await Transaction.countDocuments({
            to: testInstagramId,
            type: "daily"
        }), 1);

        await User.updateOne(
            { instagramId: testInstagramId },
            { $set: { "cooldowns.daily": new Date(Date.now() - 1000) } }
        );

        const afterExpirationResponse = await handleMessage(
            dailyMessage(claimMessageIds[2])
        );
        assert.ok(afterExpirationResponse.text.includes(`You received ${reward} coins!`));
        assert.ok(afterExpirationResponse.text.includes(`Balance: ${initialCoins + reward * 2} coins`));

        const userAfterExpirationClaim = await User.findOne({ instagramId: testInstagramId });
        assert.equal(userAfterExpirationClaim.coins, initialCoins + reward * 2);
        assert.equal(userAfterExpirationClaim.xp, DAILY_XP * 2);
        assert.ok(userAfterExpirationClaim.cooldowns.get("daily").getTime() > Date.now());
        assert.equal(await Transaction.countDocuments({
            to: testInstagramId,
            type: "daily"
        }), 2);

        await User.updateOne(
            { instagramId: testInstagramId },
            { $set: { "cooldowns.daily": new Date(Date.now() - 1000) } }
        );

        const raceResponses = await Promise.all([
            handleMessage(dailyMessage(claimMessageIds[3])),
            handleMessage(dailyMessage(claimMessageIds[4]))
        ]);
        assert.equal(
            raceResponses.filter((response) => response.text.includes("You received")).length,
            1
        );
        assert.equal(
            raceResponses.filter((response) => response.text.includes("Daily already claimed"))
                .length,
            1
        );

        const userAfterRace = await User.findOne({ instagramId: testInstagramId });
        assert.equal(userAfterRace.coins, initialCoins + reward * 3);
        assert.equal(userAfterRace.xp, DAILY_XP * 3);
        assert.equal(await Transaction.countDocuments({
            to: testInstagramId,
            type: "daily"
        }), 3);
    } finally {
        try {
            await Transaction.deleteMany({
                to: testInstagramId,
                type: "daily",
                "metadata.messageId": { $in: claimMessageIds }
            });
            if (ownsTestUserId) {
                await User.deleteOne({ instagramId: testInstagramId });
            }
        } finally {
            if (mongoose.connection.readyState === 1) {
                await mongoose.disconnect();
            }
        }
    }
});