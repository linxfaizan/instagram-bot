require("dotenv").config();

const assert = require("node:assert/strict");
const { test } = require("node:test");
const mongoose = require("mongoose");
const connectDatabase = require("../src/config/database");
const User = require("../src/models/User");
const Transaction = require("../src/models/Transaction");
const jobs = require("../src/config/jobs");
const { handleMessage } = require("./handleMessage");

const userId = "eco-bot-profile-test-user";
const otherUserId = "eco-bot-profile-test-user-2";
const userIds = [userId, otherUserId];

function profileMessage(text) {
    return {
        platform: "instagram",
        userId,
        username: "profile_test_user",
        messageId: `profile-test-${Date.now()}`,
        text,
        timestamp: Date.now()
    };
}

test("/profile displays public economy data without changing records", async () => {
    const createdUserIds = [];

    try {
        await connectDatabase();
        assert.equal(mongoose.connection.readyState, 1, "MongoDB should be connected");

        const existingUsers = await User.find({
            $or: [
                { instagramId: { $in: userIds } },
                { username: { $in: ["profile_test_user", "profile_test_user_2"] } }
            ]
        }).select("instagramId").lean();
        assert.deepEqual(existingUsers, [], "profile test accounts must not already exist");

        await User.create({
            instagramId: userId,
            username: "profile_test_user",
            coins: 9800,
            xp: 1140,
            level: 12,
            workXp: 340,
            workLevel: 5,
            job: "developer",
            workStartedAt: new Date()
        });
        createdUserIds.push(userId);
        await User.create({
            instagramId: otherUserId,
            username: "profile_test_user_2",
            coins: 5420,
            xp: 720,
            level: 8
        });
        createdUserIds.push(otherUserId);

        const beforeUsers = await User.find({ instagramId: { $in: userIds } })
            .select("instagramId coins xp level workXp workLevel job workStartedAt cooldowns")
            .lean();
        const beforeTransactions = await Transaction.countDocuments({
            $or: [{ from: { $in: userIds } }, { to: { $in: userIds } }]
        });

        const ownResponse = await handleMessage(profileMessage("/profile"));
        const developer = jobs.find((job) => job.id === "developer");
        assert.equal(ownResponse.type, "text");
        assert.ok(ownResponse.text.includes("👤 @profile_test_user"));
        assert.ok(ownResponse.text.includes("💰 Cash: 9,800"));
        assert.ok(ownResponse.text.includes("⭐ Level: 12"));
        assert.ok(ownResponse.text.includes("✨ XP: 1,140 / 1,200"));
        assert.ok(ownResponse.text.includes(`💼 Job: ${developer.emoji} ${developer.name}`));
        assert.ok(ownResponse.text.includes("📈 Work Level: 5"));
        assert.ok(ownResponse.text.includes("✨ Work XP: 340 / 500"));
        assert.doesNotMatch(ownResponse.text, /Bank|Wallet/);
        assert.doesNotMatch(ownResponse.text, /eco-bot-profile-test-user|ObjectId|workStartedAt/i);

        const otherResponse = await handleMessage(
            profileMessage("/profile @profile_test_user_2")
        );
        assert.ok(otherResponse.text.includes("👤 @profile_test_user_2"));
        assert.ok(otherResponse.text.includes("💰 Cash: 5,420"));
        assert.ok(otherResponse.text.includes("⭐ Level: 8"));
        assert.ok(otherResponse.text.includes("✨ XP: 720 / 800"));
        assert.ok(otherResponse.text.includes("💼 Job: Not selected"));
        assert.ok(otherResponse.text.includes("📈 Work Level: 1"));
        assert.ok(otherResponse.text.includes("✨ Work XP: 0 / 100"));
        assert.doesNotMatch(otherResponse.text, /Bank|Wallet|eco-bot-profile-test-user|ObjectId/);

        const otherResponseWithoutAt = await handleMessage(
            profileMessage("/profile PROFILE_TEST_USER_2")
        );
        assert.ok(otherResponseWithoutAt.text.includes("👤 @profile_test_user_2"));

        const missingResponse = await handleMessage(
            profileMessage("/profile @missing_profile_test_user")
        );
        assert.ok(missingResponse.text.includes("User Not Found"));
        assert.ok(missingResponse.text.includes("@missing_profile_test_user"));
        assert.equal(await User.exists({ username: "missing_profile_test_user" }), null);

        const afterUsers = await User.find({ instagramId: { $in: userIds } })
            .select("instagramId coins xp level workXp workLevel job workStartedAt cooldowns")
            .lean();
        const afterTransactions = await Transaction.countDocuments({
            $or: [{ from: { $in: userIds } }, { to: { $in: userIds } }]
        });

        assert.deepEqual(afterUsers, beforeUsers);
        assert.equal(afterTransactions, beforeTransactions);
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
