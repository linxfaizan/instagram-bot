require("dotenv").config();

const assert = require("node:assert/strict");
const { test } = require("node:test");
const mongoose = require("mongoose");
const connectDatabase = require("../src/config/database");
const User = require("../src/models/User");
const Transaction = require("../src/models/Transaction");
const { handleMessage } = require("./handleMessage");
const { FISH_XP } = require("../src/config/xp");
const fishConfig = require("../src/config/fish");
const { createFishCommand } = require("../src/commands/fish");

const testUserId = "fish-test-user";
const invalidArgsUserId = "fish-invalid-args-test-user";
const messageIds = Array.from({ length: 8 }, (_, index) => `fish-test-message-${index}`);

function makeMessage(userId, text = "/fish", messageId = messageIds[0]) {
    return {
        platform: "instagram",
        userId,
        username: "fish_test_user",
        messageId,
        text,
        timestamp: Date.now()
    };
}

function randomSequence(...values) {
    let index = 0;
    return () => values[index++];
}

function inventoryCount(inventory) {
    return inventory.reduce((sum, item) => sum + item.quantity, 0);
}

test("fish config validates and selection uses rarity weights", () => {
    assert.equal(fishConfig.validateFishConfiguration(), true);
    assert.equal(Object.values(fishConfig.rarityWeights).reduce((sum, weight) => sum + weight, 0), 100);
    assert.equal(fishConfig.getFishCooldownSeconds({}), 60);

    const cases = [
        [0, 0, "sardine"],
        [0.5, 0, "salmon"],
        [0.75, 0, "squid"],
        [0.91, 0, "shark"],
        [0.975, 0, "whale"],
        [0.995, 0, "golden-fish"]
    ];
    for (const [rarityRoll, fishRoll, expected] of cases) {
        assert.equal(fishConfig.selectFish(randomSequence(rarityRoll, fishRoll)).itemId, expected);
    }

    for (let index = 0; index < 100; index += 1) {
        const selectedFish = fishConfig.selectFish();
        assert.ok(fishConfig.fishTypes.some((fish) => fish.itemId === selectedFish.itemId));
    }

    assert.throws(
        () => fishConfig.validateFishConfiguration([
            ...fishConfig.fishTypes,
            { ...fishConfig.fishTypes[0] }
        ]),
        /Invalid fish configuration/
    );
    assert.throws(
        () => fishConfig.validateFishConfiguration(fishConfig.fishTypes, {
            ...fishConfig.rarityWeights,
            mythic: 0
        }),
        /Invalid fish rarity weights/
    );
    assert.throws(() => fishConfig.getFishCooldownSeconds({ FISH_COOLDOWN: "0" }), /Invalid fish cooldown/);
    assert.throws(() => fishConfig.getFishCooldownSeconds({ FISH_COOLDOWN: "1.5" }), /Invalid fish cooldown/);
    assert.throws(() => fishConfig.getFishCooldownSeconds({ FISH_COOLDOWN: "invalid" }), /Invalid fish cooldown/);
});

test("/fish stacks inventory, awards only general XP, and claims its cooldown once", async () => {
    const cooldownSeconds = fishConfig.getFishCooldownSeconds();
    let ownsUser = false;

    try {
        await connectDatabase();
        assert.equal(mongoose.connection.readyState, 1);
        const existing = await User.find({ instagramId: { $in: [testUserId, invalidArgsUserId] } })
            .select("instagramId")
            .lean();
        assert.deepEqual(existing, []);

        const invalidArgsResponse = await handleMessage(
            makeMessage(invalidArgsUserId, "/fish shark", "fish-invalid-args")
        );
        assert.ok(invalidArgsResponse.text.includes("Usage: /fish"));
        assert.equal(await User.exists({ instagramId: invalidArgsUserId }), null);

        await User.create({
            instagramId: testUserId,
            username: "fish_test_user",
            coins: 777,
            xp: 10,
            workXp: 42,
            workLevel: 3,
            job: "chef",
            inventory: []
        });
        ownsUser = true;

        const transactionCount = await Transaction.countDocuments({
            $or: [{ from: testUserId }, { to: testUserId }]
        });
        const firstResponse = await handleMessage(makeMessage(testUserId, "/fish", messageIds[0]));
        const firstFish = fishConfig.fishTypes.find((fish) =>
            firstResponse.text.includes(`You caught a ${fish.name}!`)
        );
        assert.ok(firstFish);
        const rarity = `${firstFish.rarity[0].toUpperCase()}${firstFish.rarity.slice(1)}`;
        assert.ok(firstResponse.text.includes(`${firstFish.emoji} You caught a ${firstFish.name}!`));
        assert.ok(firstResponse.text.includes(`Rarity: ${rarity}`));
        assert.ok(firstResponse.text.includes(`+${FISH_XP} XP`));

        let user = await User.findOne({ instagramId: testUserId });
        assert.equal(user.coins, 777);
        assert.equal(user.xp, 10 + FISH_XP);
        assert.equal(user.workXp, 42);
        assert.equal(user.workLevel, 3);
        assert.equal(user.job, "chef");
        assert.deepEqual(user.inventory, [{ itemId: firstFish.itemId, quantity: 1 }]);
        const firstCooldown = user.cooldowns.get("fish");
        assert.ok(firstCooldown instanceof Date);
        assert.ok(firstCooldown.getTime() >= Date.now() + cooldownSeconds * 1000 - 5000);
        assert.equal(await Transaction.countDocuments({
            $or: [{ from: testUserId }, { to: testUserId }]
        }), transactionCount);

        const cooldownResponse = await handleMessage(makeMessage(testUserId, "/fish", messageIds[1]));
        assert.ok(cooldownResponse.text.startsWith("⏳ You can fish again in"));
        user = await User.findOne({ instagramId: testUserId });
        assert.equal(user.coins, 777);
        assert.equal(user.xp, 10 + FISH_XP);
        assert.deepEqual(user.inventory, [{ itemId: firstFish.itemId, quantity: 1 }]);
        assert.equal(user.cooldowns.get("fish").getTime(), firstCooldown.getTime());

        const salmon = fishConfig.fishTypes.find((fish) => fish.itemId === "salmon");
        const deterministicCommand = createFishCommand(() => salmon);
        for (const messageId of [messageIds[2], messageIds[3]]) {
            await User.updateOne(
                { instagramId: testUserId },
                { $set: { "cooldowns.fish": new Date(Date.now() - 1000) } }
            );
            const response = await deterministicCommand({
                message: makeMessage(testUserId, "/fish", messageId),
                args: []
            });
            assert.ok(response.text.includes("You caught a Salmon!"));
        }

        user = await User.findOne({ instagramId: testUserId });
        const salmonEntries = user.inventory.filter((item) => item.itemId === "salmon");
        assert.equal(salmonEntries.length, 1);
        assert.equal(salmonEntries[0].quantity, (firstFish.itemId === "salmon" ? 1 : 0) + 2);

        await User.updateOne(
            { instagramId: testUserId },
            { $set: { "cooldowns.fish": new Date(Date.now() - 1000) } }
        );
        const expiredResponse = await handleMessage(makeMessage(testUserId, "/fish", messageIds[4]));
        assert.ok(expiredResponse.text.includes("You caught a"));

        await User.updateOne(
            { instagramId: testUserId },
            { $set: { "cooldowns.fish": new Date(Date.now() - 1000) } }
        );
        const beforeRace = await User.findOne({ instagramId: testUserId })
            .select("inventory xp coins")
            .lean();
        const raceResponses = await Promise.all([
            handleMessage(makeMessage(testUserId, "/fish", messageIds[5])),
            handleMessage(makeMessage(testUserId, "/fish", messageIds[6]))
        ]);
        assert.equal(raceResponses.filter((response) => response.text.includes("You caught a")).length, 1);
        assert.equal(raceResponses.filter((response) => response.text.startsWith("⏳ You can fish again in")).length, 1);

        user = await User.findOne({ instagramId: testUserId });
        assert.equal(user.coins, 777);
        assert.equal(user.xp, beforeRace.xp + FISH_XP);
        assert.equal(inventoryCount(user.inventory), inventoryCount(beforeRace.inventory) + 1);
        assert.equal(await Transaction.countDocuments({
            $or: [{ from: testUserId }, { to: testUserId }]
        }), transactionCount);
    } finally {
        if (mongoose.connection.readyState === 1) {
            try {
                if (ownsUser) {
                    await User.deleteOne({ instagramId: testUserId });
                }
            } finally {
                await mongoose.disconnect();
            }
        }
    }
});
