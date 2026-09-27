require("dotenv").config();

const assert = require("node:assert/strict");
const { test } = require("node:test");
const mongoose = require("mongoose");
const connectDatabase = require("../src/config/database");
const User = require("../src/models/User");
const Transaction = require("../src/models/Transaction");

const testInstagramId = "eco-bot-test-user";
const testRunId = `eco-bot-test-${Date.now()}-${process.pid}`;

test("User and Transaction models persist and retrieve test data", async () => {
    let createdUser = false;

    try {
        await connectDatabase();
        assert.equal(mongoose.connection.readyState, 1, "MongoDB should be connected");

        const existingUser = await User.findOne({ instagramId: testInstagramId });
        assert.equal(existingUser, null, "test Instagram ID must not already exist");

        const user = await User.create({
            instagramId: testInstagramId,
            username: "eco_bot_test"
        });
        createdUser = true;

        const retrievedUser = await User.findOne({ instagramId: testInstagramId });
        assert.ok(retrievedUser, "created user should be retrievable");
        assert.equal(retrievedUser.instagramId, testInstagramId);
        assert.equal(retrievedUser.coins, Number(process.env.DEFAULT_COINS ?? 100));
        assert.equal(retrievedUser.bank, 0);
        assert.equal(retrievedUser.xp, 0);
        assert.equal(retrievedUser.level, 1);
        assert.deepEqual(retrievedUser.inventory, []);
        assert.ok(retrievedUser.createdAt instanceof Date);
        assert.ok(retrievedUser.updatedAt instanceof Date);

        const transaction = await Transaction.create({
            to: testInstagramId,
            amount: 500,
            type: "daily",
            metadata: { testRunId }
        });
        const retrievedTransaction = await Transaction.findOne({
            "metadata.testRunId": testRunId
        });

        assert.ok(retrievedTransaction, "created transaction should be retrievable");
        assert.equal(retrievedTransaction.id, transaction.id);
        assert.equal(retrievedTransaction.to, testInstagramId);
        assert.equal(retrievedTransaction.amount, 500);
        assert.equal(retrievedTransaction.type, "daily");
        assert.ok(retrievedTransaction.timestamp instanceof Date);
    } finally {
        try {
            await Transaction.deleteMany({ "metadata.testRunId": testRunId });
            if (createdUser) {
                await User.deleteOne({ instagramId: testInstagramId });
            }
        } finally {
            if (mongoose.connection.readyState === 1) {
                await mongoose.disconnect();
            }
        }
    }
});