require("dotenv").config();

const assert = require("node:assert/strict");
const { test } = require("node:test");
const mongoose = require("mongoose");
const connectDatabase = require("../src/config/database");
const User = require("../src/models/User");
const Transaction = require("../src/models/Transaction");
const {
    getBalance,
    addCoins,
    removeCoins,
    transferCoins
} = require("../src/services/economyService");

const senderId = "eco-bot-economy-test-a";
const recipientId = "eco-bot-economy-test-b";
const testRunId = `eco-bot-economy-test-${Date.now()}-${process.pid}`;

test("economy service validates and records balance changes", async () => {
    const createdUserIds = [];

    try {
        await connectDatabase();
        assert.equal(mongoose.connection.readyState, 1, "MongoDB should be connected");

        const existingUsers = await User.find({
            instagramId: { $in: [senderId, recipientId] }
        }).select("instagramId").lean();
        assert.deepEqual(existingUsers, [], "economy test IDs must not already exist");

        await User.create({ instagramId: senderId, username: "economy_test_a", coins: 1000 });
        createdUserIds.push(senderId);
        await User.create({ instagramId: recipientId, username: "economy_test_b", coins: 200 });
        createdUserIds.push(recipientId);

        assert.deepEqual(await getBalance(senderId), { coins: 1000, bank: 0 });

        const addedUser = await addCoins(senderId, 50, "admin", { testRunId });
        assert.equal(addedUser.coins, 1050);
        assert.ok(await Transaction.exists({
            to: senderId,
            amount: 50,
            type: "admin",
            "metadata.testRunId": testRunId
        }));

        const removedUser = await removeCoins(senderId, 25, "admin", { testRunId });
        assert.equal(removedUser.coins, 1025);
        assert.ok(await Transaction.exists({
            from: senderId,
            amount: 25,
            type: "admin",
            "metadata.testRunId": testRunId
        }));

        await assert.rejects(
            removeCoins(senderId, 5000, "admin", { testRunId }),
            /Insufficient coins/
        );

        for (const invalidAmount of [0, -1, NaN, Infinity, "10", null]) {
            await assert.rejects(addCoins(senderId, invalidAmount, "admin"), /Invalid amount/);
            await assert.rejects(removeCoins(senderId, invalidAmount, "admin"), /Invalid amount/);
            await assert.rejects(
                transferCoins(senderId, recipientId, invalidAmount),
                /Invalid amount/
            );
        }

        const transfer = await transferCoins(senderId, recipientId, 100, { testRunId });
        assert.deepEqual(transfer, {
            from: { instagramId: senderId, coins: 925, bank: 0 },
            to: { instagramId: recipientId, coins: 300, bank: 0 }
        });
        assert.ok(await Transaction.exists({
            from: senderId,
            to: recipientId,
            amount: 100,
            type: "pay",
            "metadata.testRunId": testRunId
        }));

        assert.deepEqual(await getBalance(senderId), { coins: 925, bank: 0 });
        assert.deepEqual(await getBalance(recipientId), { coins: 300, bank: 0 });
        await assert.rejects(
            transferCoins(senderId, senderId, 1),
            /Cannot transfer coins to yourself/
        );

        const missingId = "eco-bot-economy-user-does-not-exist";
        await assert.rejects(getBalance(missingId), /User not found/);
        await assert.rejects(addCoins(missingId, 1, "admin"), /User not found/);
        await assert.rejects(removeCoins(missingId, 1, "admin"), /User not found/);
        await assert.rejects(transferCoins(senderId, missingId, 1), /User not found/);
    } finally {
        try {
            await Transaction.deleteMany({ "metadata.testRunId": testRunId });
            if (createdUserIds.length > 0) {
                await User.deleteMany({ instagramId: { $in: createdUserIds } });
            }
        } finally {
            if (mongoose.connection.readyState === 1) {
                await mongoose.disconnect();
            }
        }
    }
});