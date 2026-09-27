require("dotenv").config();

const assert = require("node:assert/strict");
const { test } = require("node:test");
const mongoose = require("mongoose");
const connectDatabase = require("../src/config/database");
const User = require("../src/models/User");
const Transaction = require("../src/models/Transaction");
const { handleMessage } = require("./handleMessage");
const { readBegConfig, validateBegConfig } = require("../src/config/beg");
const { BEG_XP } = require("../src/config/xp");
const { generateReward, formatRemainingTime } = require("../src/commands/beg");

const testUserId = "beg-test-user";
const begMessageIds = Array.from({ length: 16 }, (_, index) => `beg-test-message-${index}`);

function begMessage(messageId) {
    return {
        platform: "instagram",
        userId: testUserId,
        username: "beg_test_user",
        messageId,
        text: "/beg",
        timestamp: Date.now()
    };
}

test("/beg awards configured cash and XP once per persistent cooldown", async () => {
    const config = validateBegConfig(readBegConfig());
    let ownsTestUser = false;

    assert.deepEqual(readBegConfig({}), {
        minReward: 50,
        maxReward: 250,
        cooldownSeconds: 300
    });
    assert.deepEqual(validateBegConfig({ minReward: 75, maxReward: 75, cooldownSeconds: 1 }), {
        minReward: 75,
        maxReward: 75,
        cooldownSeconds: 1
    });
    for (const invalidConfig of [
        { minReward: 100, maxReward: 50, cooldownSeconds: 300 },
        { minReward: 0, maxReward: 50, cooldownSeconds: 300 },
        { minReward: -1, maxReward: 50, cooldownSeconds: 300 },
        { minReward: 1.5, maxReward: 50, cooldownSeconds: 300 },
        { minReward: 1, maxReward: 50.5, cooldownSeconds: 300 },
        { minReward: 1, maxReward: 50, cooldownSeconds: 1.5 },
        { minReward: 1, maxReward: 50, cooldownSeconds: 0 },
        { minReward: 1, maxReward: Number.MAX_SAFE_INTEGER + 1, cooldownSeconds: 300 }
    ]) {
        assert.throws(() => validateBegConfig(invalidConfig), /Invalid beg configuration/);
    }
    assert.equal(generateReward(75, 75), 75);
    assert.equal(formatRemainingTime(60_000), "1m 0s");
    assert.equal(formatRemainingTime(45_000), "45s");

    for (let iteration = 0; iteration < 100; iteration += 1) {
        const reward = generateReward(config.minReward, config.maxReward);
        assert.ok(Number.isInteger(reward));
        assert.ok(reward >= config.minReward && reward <= config.maxReward);
    }

    try {
        await connectDatabase();
        assert.equal(mongoose.connection.readyState, 1, "MongoDB should be connected");

        const existingUser = await User.findOne({ instagramId: testUserId });
        assert.equal(existingUser, null, "beg test user must not already exist");

        await User.create({
            instagramId: testUserId,
            username: "beg_test_user",
            coins: 1000,
            xp: 20,
            workXp: 73,
            workLevel: 3,
            job: "chef"
        });
        ownsTestUser = true;

        const firstResponse = await handleMessage(begMessage(begMessageIds[0]));
        const rewardMatch = firstResponse.text.match(/You received ([\d,]+) coins!/);
        assert.ok(rewardMatch, "success response should include awarded coins");
        const firstReward = Number(rewardMatch[1].replace(/,/g, ""));
        assert.ok(Number.isInteger(firstReward));
        assert.ok(firstReward > 0);
        assert.ok(firstReward >= config.minReward && firstReward <= config.maxReward);
        assert.ok(firstResponse.text.includes(`+${BEG_XP} XP`));
        assert.ok(firstResponse.text.includes("beg again in"));

        let user = await User.findOne({ instagramId: testUserId });
        assert.equal(user.coins, 1000 + firstReward);
        assert.equal(user.xp, 20 + BEG_XP);
        assert.equal(user.workXp, 73);
        assert.equal(user.workLevel, 3);
        assert.equal(user.job, "chef");
        const originalCooldown = user.cooldowns.get("beg");
        assert.ok(originalCooldown instanceof Date);
        assert.ok(originalCooldown.getTime() >= Date.now() + config.cooldownSeconds * 1000 - 5000);

        const firstTransaction = await Transaction.findOne({
            to: testUserId,
            type: "beg",
            "metadata.minReward": config.minReward,
            "metadata.maxReward": config.maxReward
        });
        assert.ok(firstTransaction);
        assert.equal(firstTransaction.amount, firstReward);

        const cooldownResponse = await handleMessage(begMessage(begMessageIds[1]));
        assert.ok(cooldownResponse.text.startsWith("⏳ You can beg again in"));
        assert.ok(!cooldownResponse.text.includes("You received"));
        assert.match(cooldownResponse.text, /You can beg again in \d+m \d+s|You can beg again in \d+s/);
        user = await User.findOne({ instagramId: testUserId });
        assert.equal(user.coins, 1000 + firstReward);
        assert.equal(user.xp, 20 + BEG_XP);
        assert.equal(user.cooldowns.get("beg").getTime(), originalCooldown.getTime());
        assert.equal(await Transaction.countDocuments({ to: testUserId, type: "beg" }), 1);

        let totalReward = firstReward;
        for (let index = 2; index < 12; index += 1) {
            await User.updateOne(
                { instagramId: testUserId },
                { $set: { "cooldowns.beg": new Date(Date.now() - 1000) } }
            );
            const response = await handleMessage(begMessage(begMessageIds[index]));
            const match = response.text.match(/You received ([\d,]+) coins!/);
            assert.ok(match);
            const reward = Number(match[1].replace(/,/g, ""));
            assert.ok(Number.isInteger(reward));
            assert.ok(reward >= config.minReward && reward <= config.maxReward);
            totalReward += reward;
        }

        user = await User.findOne({ instagramId: testUserId });
        assert.equal(user.coins, 1000 + totalReward);
        assert.equal(user.xp, 20 + BEG_XP * 11);
        assert.equal(user.workXp, 73);
        assert.equal(user.workLevel, 3);
        assert.equal(user.job, "chef");
        assert.equal(await Transaction.countDocuments({ to: testUserId, type: "beg" }), 11);

        await User.updateOne(
            { instagramId: testUserId },
            { $set: { "cooldowns.beg": new Date(Date.now() - 1000) } }
        );
        const simultaneousResponses = await Promise.all([
            handleMessage(begMessage(begMessageIds[12])),
            handleMessage(begMessage(begMessageIds[13]))
        ]);
        assert.equal(
            simultaneousResponses.filter((response) => response.text.includes("You received")).length,
            1
        );
        assert.equal(
            simultaneousResponses.filter((response) => response.text.startsWith("⏳ You can beg again in")).length,
            1
        );
        assert.equal(await Transaction.countDocuments({ to: testUserId, type: "beg" }), 12);
    } finally {
        if (mongoose.connection.readyState === 1) {
            try {
                await Transaction.deleteMany({
                    to: testUserId,
                    type: "beg",
                    "metadata.minReward": config.minReward,
                    "metadata.maxReward": config.maxReward
                });
                if (ownsTestUser) {
                    await User.deleteOne({ instagramId: testUserId });
                }
            } finally {
                await mongoose.disconnect();
            }
        }
    }
});
