require("dotenv").config();

const assert = require("node:assert/strict");
const { test } = require("node:test");
const mongoose = require("mongoose");
const connectDatabase = require("../src/config/database");
const User = require("../src/models/User");
const { parseCommand } = require("../src/parser/commandParser");
const { handleMessage } = require("./handleMessage");

const testInstagramId = "eco-bot-command-test-user";

test("parser and /balance command work with MongoDB", async () => {
    assert.deepEqual(parseCommand(" /balance "), { command: "balance", args: [] });
    assert.deepEqual(parseCommand("/BALANCE"), { command: "balance", args: [] });
    assert.deepEqual(parseCommand("/balance test"), {
        command: "balance",
        args: ["test"]
    });
    assert.equal(parseCommand("hello"), null);
    assert.equal(parseCommand(null), null);

    let ownsTestUserId = false;

    try {
        await connectDatabase();
        assert.equal(mongoose.connection.readyState, 1, "MongoDB should be connected");

        const existingUser = await User.findOne({ instagramId: testInstagramId });
        assert.equal(existingUser, null, "test Instagram ID must not already exist");
        ownsTestUserId = true;

        const response = await handleMessage({
            platform: "instagram",
            userId: testInstagramId,
            username: "eco_bot_command_test",
            messageId: "eco-bot-command-test-message",
            text: "/balance",
            timestamp: Date.now()
        });

        assert.equal(response.type, "text");
        assert.ok(response.text.includes(`Coins: ${Number(process.env.DEFAULT_COINS ?? 100)}`));
        assert.ok(response.text.includes("Bank: 0"));
        assert.ok(response.text.includes("Level: 1"));
        assert.ok(response.text.includes("XP: 0"));

        const unknownResponse = await handleMessage({
            userId: testInstagramId,
            text: "/unknown"
        });
        assert.deepEqual(unknownResponse, {
            type: "text",
            text: "❌ Unknown command. Try /balance."
        });

        assert.equal(await handleMessage({ userId: testInstagramId, text: "hello" }), null);
    } finally {
        try {
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