require("dotenv").config();

const assert = require("node:assert/strict");
const { test } = require("node:test");
const mongoose = require("mongoose");
const connectDatabase = require("../src/config/database");
const User = require("../src/models/User");
const Transaction = require("../src/models/Transaction");
const { handleMessage } = require("./handleMessage");
const { WORK_START_XP, WORK_COMPLETE_XP, WORK_XP_PER_COMPLETION } = require("../src/config/xp");

const primaryUserId = "eco-bot-work-test-user";
const concurrentUserId = "eco-bot-work-test-user-2";
const workDurationMs = 60 * 60 * 1000;

function workMessage(userId, text, messageId) {
    return {
        platform: "instagram",
        userId,
        username: "eco_bot_work_test",
        messageId,
        text,
        timestamp: Date.now()
    };
}

test("career selection and one-hour work shifts are persistent and claim once", async () => {
    const createdUserIds = [];

    try {
        await connectDatabase();
        assert.equal(mongoose.connection.readyState, 1, "MongoDB should be connected");

        const existingUsers = await User.find({
            instagramId: { $in: [primaryUserId, concurrentUserId] }
        }).select("instagramId").lean();
        assert.deepEqual(existingUsers, [], "work test IDs must not already exist");

        const menuResponse = await handleMessage(
            workMessage(primaryUserId, "/work", "work-test-menu")
        );
        createdUserIds.push(primaryUserId);
        assert.ok(menuResponse.text.includes("Choose Your Work"));
        assert.ok(menuResponse.text.includes("Web Developer"));

        const selectionResponse = await handleMessage(
            workMessage(primaryUserId, "1", "work-test-select")
        );
        assert.ok(selectionResponse.text.includes("Career Selected!"));
        assert.ok(selectionResponse.text.includes("Web Developer"));

        let user = await User.findOne({ instagramId: primaryUserId });
        assert.equal(user.job, "developer");
        assert.equal(user.workStartedAt, null);
        assert.equal(user.jobSelectionPending, false);
        assert.equal(user.xp, 0, "career selection awards no general XP");
        assert.equal(user.workXp, 0, "career selection awards no work XP");

        const initialCoins = user.coins;
        const startResponse = await handleMessage(
            workMessage(primaryUserId, "/work", "work-test-start")
        );
        assert.ok(startResponse.text.includes("Work Started!"));

        user = await User.findOne({ instagramId: primaryUserId });
        assert.ok(user.workStartedAt instanceof Date);
        const originalStartTime = user.workStartedAt.getTime();
        assert.equal(user.coins, initialCoins);
        assert.equal(user.xp, WORK_START_XP);
        assert.equal(user.workXp, 0, "starting work awards no work XP");
        assert.equal(await Transaction.countDocuments({ to: primaryUserId, type: "work" }), 0);

        await User.updateOne(
            { instagramId: primaryUserId },
            { $set: { workStartedAt: new Date(Date.now() - 20 * 60 * 1000) } }
        );
        user = await User.findOne({ instagramId: primaryUserId });
        const earlyStartTime = user.workStartedAt.getTime();

        const earlyResponse = await handleMessage(
            workMessage(primaryUserId, "/work", "work-test-early")
        );
        assert.ok(earlyResponse.text.includes("You're still working!"));
        assert.ok(earlyResponse.text.includes("Time remaining: 40m"));

        user = await User.findOne({ instagramId: primaryUserId });
        assert.equal(user.workStartedAt.getTime(), earlyStartTime);
        assert.equal(user.coins, initialCoins);
        assert.equal(user.xp, WORK_START_XP, "early claims award no XP");
        assert.equal(user.workXp, 0, "early claims award no work XP");
        assert.equal(await Transaction.countDocuments({ to: primaryUserId, type: "work" }), 0);
        assert.notEqual(earlyStartTime, originalStartTime);

        await User.updateOne(
            { instagramId: primaryUserId },
            { $set: { workStartedAt: new Date(Date.now() - workDurationMs - 1000) } }
        );

        const beforeClaim = await User.findOne({ instagramId: primaryUserId });
        const claimResponse = await handleMessage(
            workMessage(primaryUserId, "/work", "work-test-claim")
        );
        const rewardMatch = claimResponse.text.match(/You earned (\d+) coins!/);
        assert.ok(rewardMatch, "completed shift should return its reward");
        const reward = Number(rewardMatch[1]);
        assert.ok(reward >= 200 && reward <= 500);

        user = await User.findOne({ instagramId: primaryUserId });
        assert.equal(user.coins, beforeClaim.coins + reward);
        assert.equal(user.workStartedAt, null);
        assert.equal(user.xp, WORK_START_XP + WORK_COMPLETE_XP);
        assert.equal(user.workXp, WORK_XP_PER_COMPLETION);
        assert.equal(await Transaction.countDocuments({
            to: primaryUserId,
            type: "work",
            amount: reward
        }), 1);

        const nextStartResponse = await handleMessage(
            workMessage(primaryUserId, "/work", "work-test-next-start")
        );
        assert.ok(nextStartResponse.text.includes("Work Started!"));
        user = await User.findOne({ instagramId: primaryUserId });
        assert.ok(user.workStartedAt instanceof Date);
        assert.equal(user.coins, beforeClaim.coins + reward);
        assert.equal(user.xp, WORK_START_XP * 2 + WORK_COMPLETE_XP);
        assert.equal(user.workXp, WORK_XP_PER_COMPLETION);
        assert.equal(await Transaction.countDocuments({ to: primaryUserId, type: "work" }), 1);

        const raceStartedAt = new Date(Date.now() - workDurationMs - 1000);
        await User.create({
            instagramId: concurrentUserId,
            username: "eco_bot_work_test_2",
            coins: 1000,
            job: "developer",
            workStartedAt: raceStartedAt
        });
        createdUserIds.push(concurrentUserId);

        const raceResponses = await Promise.all([
            handleMessage(workMessage(concurrentUserId, "/work", "work-test-race-a")),
            handleMessage(workMessage(concurrentUserId, "/work", "work-test-race-b"))
        ]);
        assert.equal(
            raceResponses.filter((response) => response.text.includes("Work Complete!")).length,
            1
        );
        assert.equal(
            raceResponses.filter((response) => response.text.includes("already claimed")).length,
            1
        );

        const concurrentUser = await User.findOne({ instagramId: concurrentUserId });
        assert.ok(concurrentUser.coins >= 1200 && concurrentUser.coins <= 1500);
        assert.equal(concurrentUser.workStartedAt, null);
        assert.equal(concurrentUser.xp, WORK_COMPLETE_XP);
        assert.equal(concurrentUser.workXp, WORK_XP_PER_COMPLETION);
        assert.equal(await Transaction.countDocuments({
            to: concurrentUserId,
            type: "work"
        }), 1);
    } finally {
        try {
            if (createdUserIds.length > 0) {
                await Transaction.deleteMany({
                    to: { $in: createdUserIds },
                    type: "work"
                });
                await User.deleteMany({ instagramId: { $in: createdUserIds } });
            }
        } finally {
            if (mongoose.connection.readyState === 1) {
                await mongoose.disconnect();
            }
        }
    }
});
