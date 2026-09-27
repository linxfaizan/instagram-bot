require("dotenv").config();

const assert = require("node:assert/strict");
const { test } = require("node:test");
const mongoose = require("mongoose");
const connectDatabase = require("../src/config/database");
const User = require("../src/models/User");
const {
    getXpRequiredForNextLevel,
    addUserXp,
    addWorkXp,
    getLevelProgress
} = require("../src/services/levelService");
const { handleMessage } = require("./handleMessage");

const userId = "eco-bot-level-test-user";
const targetUserId = "eco-bot-level-test-user-2";

function message(userId, text) {
    return {
        platform: "instagram",
        userId,
        username: "level_test_user",
        messageId: `level-test-${Date.now()}`,
        text,
        timestamp: Date.now()
    };
}

test("general and work XP progress independently and /level is read-only", async () => {
    const createdUserIds = [];

    try {
        await connectDatabase();
        assert.equal(mongoose.connection.readyState, 1, "MongoDB should be connected");

        const existingUsers = await User.find({
            instagramId: { $in: [userId, targetUserId] }
        }).select("instagramId").lean();
        assert.deepEqual(existingUsers, [], "level test IDs must not already exist");

        await User.create({ instagramId: userId, username: "level_test_user" });
        createdUserIds.push(userId);
        await User.create({
            instagramId: targetUserId,
            username: "level_target_user",
            level: 3,
            xp: 25,
            workLevel: 2,
            workXp: 45
        });
        createdUserIds.push(targetUserId);

        let user = await User.findOne({ instagramId: userId });
        assert.equal(user.level, 1);
        assert.equal(user.xp, 0);
        assert.equal(user.workLevel, 1);
        assert.equal(user.workXp, 0);

        assert.equal(getXpRequiredForNextLevel(1), 100);
        assert.equal(getXpRequiredForNextLevel(2), 200);
        assert.equal(getXpRequiredForNextLevel(3), 300);
        assert.deepEqual(getLevelProgress(4, 150), {
            level: 4,
            xp: 150,
            requiredXp: 400,
            xpToNextLevel: 250
        });

        await addUserXp(userId, 90);
        await addUserXp(userId, 20);
        user = await User.findOne({ instagramId: userId });
        assert.equal(user.level, 2);
        assert.equal(user.xp, 10);

        await addUserXp(userId, 640);
        user = await User.findOne({ instagramId: userId });
        assert.equal(user.level, 4);
        assert.equal(user.xp, 150);

        await addWorkXp(userId, 650);
        user = await User.findOne({ instagramId: userId });
        assert.equal(user.workLevel, 4);
        assert.equal(user.workXp, 50);
        assert.equal(user.level, 4);
        assert.equal(user.xp, 150);

        for (const invalidAmount of [-1, NaN, Infinity, "10", null]) {
            await assert.rejects(addUserXp(userId, invalidAmount), /Invalid XP amount/);
            await assert.rejects(addWorkXp(userId, invalidAmount), /Invalid XP amount/);
        }

        await assert.rejects(addUserXp("", 10), /Invalid Instagram ID/);
        assert.throws(() => getXpRequiredForNextLevel(0), /Invalid level/);

        const ownLevelResponse = await handleMessage(message(userId, "/level"));
        assert.ok(ownLevelResponse.text.includes("⭐ Your Level"));
        assert.ok(ownLevelResponse.text.includes("General Level: 4"));
        assert.ok(ownLevelResponse.text.includes("XP: 150 / 400"));
        assert.ok(ownLevelResponse.text.includes("Work Level: 4"));
        assert.ok(ownLevelResponse.text.includes("Work XP: 50 / 400"));
        assert.ok(ownLevelResponse.text.includes("Next General Level: 250 XP"));
        assert.ok(ownLevelResponse.text.includes("Next Work Level: 350 XP"));

        const targetLevelResponse = await handleMessage(
            message(userId, "/level @LEVEL_TARGET_USER")
        );
        assert.ok(targetLevelResponse.text.includes("@level_target_user's Level"));
        assert.ok(targetLevelResponse.text.includes("General Level: 3"));
        assert.ok(targetLevelResponse.text.includes("Work Level: 2"));

        const missingId = "eco-bot-level-view-does-not-exist";
        const missingResponse = await handleMessage(message(userId, "/level @missing_level_user"));
        assert.ok(missingResponse.text.includes("User Not Found"));
        assert.equal(await User.exists({ instagramId: missingId }), null);
        assert.equal(await User.exists({ username: "missing_level_user" }), null);
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
