const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
    processMessagingEvent
} = require("../src/webhooks/instagramWebhook");

const silentLogger = {
    log() {},
    error() {}
};

test("webhook resolves, stores, and forwards the sender username", async () => {
    const handledMessages = [];
    const savedUsers = [];
    const sentMessages = [];

    const response = await processMessagingEvent(
        {
            sender: { id: "ig-scoped-user" },
            message: { text: "/balance" }
        },
        {
            getInstagramUserProfile: async (userId) => ({
                id: userId,
                username: "Real.Profile"
            }),
            getOrCreateUser: async (userId, username) => {
                savedUsers.push({ userId, username });
            },
            handleMessage: async (message) => {
                handledMessages.push(message);
                return { type: "text", text: "Balance response" };
            },
            sendMessage: async (recipientId, text) => {
                sentMessages.push({ recipientId, text });
            },
            logger: silentLogger
        }
    );

    assert.deepEqual(savedUsers, [
        { userId: "ig-scoped-user", username: "Real.Profile" }
    ]);
    assert.deepEqual(handledMessages, [
        {
            userId: "ig-scoped-user",
            username: "Real.Profile",
            text: "/balance"
        }
    ]);
    assert.deepEqual(sentMessages, [
        { recipientId: "ig-scoped-user", text: "Balance response" }
    ]);
    assert.deepEqual(response, { type: "text", text: "Balance response" });
});

test("webhook still dispatches a message when profile lookup is unavailable", async () => {
    const handledMessages = [];

    await processMessagingEvent(
        {
            sender: { id: "ig-scoped-user" },
            message: { text: "/balance" }
        },
        {
            getInstagramUserProfile: async () => {
                throw new Error("OAuth permission error");
            },
            getOrCreateUser: async () => {
                assert.fail("a missing username must not be persisted");
            },
            handleMessage: async (message) => {
                handledMessages.push(message);
                return null;
            },
            sendMessage: async () => {
                assert.fail("a null command response must not send a DM");
            },
            logger: silentLogger
        }
    );

    assert.deepEqual(handledMessages, [
        {
            userId: "ig-scoped-user",
            username: null,
            text: "/balance"
        }
    ]);
});
