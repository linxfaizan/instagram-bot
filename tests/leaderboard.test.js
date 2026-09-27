require("dotenv").config();

const assert = require("node:assert/strict");
const { test } = require("node:test");
const mongoose = require("mongoose");
const connectDatabase = require("../src/config/database");
const User = require("../src/models/User");
const Transaction = require("../src/models/Transaction");
const { handleMessage } = require("./handleMessage");
const leaderboardCommand = require("../src/commands/leaderboard");
const { formatLeaderboard } = leaderboardCommand;
const { formatNumber } = require("../src/utils/formatNumber");

const testUserIds = Array.from({ length: 12 }, (_, index) => `leaderboard-test-${index + 1}`);
const testUsernames = Array.from({ length: 11 }, (_, index) => `leader_user_${index + 1}`);
const unknownRequesterId = "leaderboard-test-unknown-requester";
const safeMaximum = Number.MAX_SAFE_INTEGER;

function leaderboardMessage(userId) {
    return {
        platform: "instagram",
        userId,
        username: "leaderboard_test_requester",
        messageId: `leaderboard-test-${Date.now()}`,
        text: "/leaderboard",
        timestamp: Date.now()
    };
}

test("cash leaderboard sorts, ranks ties, limits results, and remains read-only", async () => {
    const createdUserIds = [];

    try {
        await connectDatabase();
        assert.equal(mongoose.connection.readyState, 1, "MongoDB should be connected");

        const existingUsers = await User.find({
            $or: [
                { instagramId: { $in: [...testUserIds, unknownRequesterId] } },
                { username: { $in: testUsernames } }
            ]
        }).select("instagramId").lean();
        assert.deepEqual(existingUsers, [], "leaderboard test records must not already exist");

        const currentTop = await User.findOne({}).sort({ coins: -1 }).select("coins").lean();
        const currentMaximum = currentTop?.coins ?? 0;
        const baseCoins = Math.max(
            8_000_000_000_000_000,
            Math.min(safeMaximum - 20_000_000, Math.ceil(currentMaximum) + 20_000_000)
        );
        assert.ok(baseCoins + 1 <= safeMaximum);

        const fixtureUsers = testUserIds.map((instagramId, index) => ({
            instagramId,
            username: index === 11 ? null : testUsernames[index],
            coins: index < 2 ? baseCoins : index === 11 ? 0 : baseCoins - (index - 1) * 1_000_000,
            xp: index * 10,
            level: 1,
            workXp: index * 5,
            workLevel: 1,
            job: index === 0 ? "developer" : null,
            workStartedAt: null
        }));
        await User.insertMany(fixtureUsers);
        createdUserIds.push(...testUserIds);

        const beforeUsers = await User.find({ instagramId: { $in: testUserIds } }).lean();
        const beforeTransactions = await Transaction.countDocuments({
            $or: [
                { from: { $in: testUserIds } },
                { to: { $in: testUserIds } }
            ]
        });

        const topResponse = await handleMessage(leaderboardMessage(testUserIds[0]));
        assert.equal(topResponse.type, "text");
        assert.ok(topResponse.text.startsWith("🏆 Eco-Bot Leaderboard"));
        assert.ok(topResponse.text.includes("1. 👑 @leader_user_1 — 💰"));
        assert.ok(topResponse.text.includes("1. 👑 @leader_user_2 — 💰"));
        assert.ok(topResponse.text.includes("3. 🥉 @leader_user_3 — 💰"));
        assert.ok(topResponse.text.includes("4. @leader_user_4 — 💰"));
        assert.ok(topResponse.text.includes("8,000,000,000,000,000"));
        assert.ok(topResponse.text.includes("⭐ Your Rank: #1"));
        assert.ok(!topResponse.text.includes("@leader_user_11"));
        assert.ok(!topResponse.text.includes("@unknown"));
        assert.equal((topResponse.text.match(/^\d+\./gm) || []).length, 10);
        assert.doesNotMatch(topResponse.text, /leaderboard-test-\d+|ObjectId|instagramId|_id/);

        const outsideTopResponse = await handleMessage(leaderboardMessage(testUserIds[10]));
        assert.ok(outsideTopResponse.text.includes("⭐ Your Rank: #11"));
        assert.ok(!outsideTopResponse.text.includes("@leader_user_11"));

        const anonymousTopResponse = await handleMessage(leaderboardMessage(unknownRequesterId));
        assert.ok(anonymousTopResponse.text.includes("⭐ Your Rank: Unranked"));
        assert.equal(await User.exists({ instagramId: unknownRequesterId }), null);

        const usernameFallbackUser = await User.findOne({ instagramId: testUserIds[11] })
            .select("coins username")
            .lean();
        assert.ok(formatLeaderboard([usernameFallbackUser], 12).includes("@unknown"));
        assert.ok(formatLeaderboard([], null).includes("No users yet."));
        assert.equal(formatNumber(1000), "1,000");
        assert.equal(formatNumber(9800), "9,800");
        assert.equal(formatNumber(1000000), "1,000,000");

        const afterUsers = await User.find({ instagramId: { $in: testUserIds } }).lean();
        const afterTransactions = await Transaction.countDocuments({
            $or: [
                { from: { $in: testUserIds } },
                { to: { $in: testUserIds } }
            ]
        });
        assert.deepEqual(afterUsers, beforeUsers);
        assert.equal(afterTransactions, beforeTransactions);
        assert.equal(await User.exists({ instagramId: unknownRequesterId }), null);
    } finally {
        if (mongoose.connection.readyState === 1) {
            try {
                if (createdUserIds.length > 0) {
                    await User.deleteMany({ instagramId: { $in: createdUserIds } });
                }
            } finally {
                await mongoose.disconnect();
            }
        }
    }
});
