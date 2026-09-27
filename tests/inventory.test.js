require("dotenv").config();

const assert = require("node:assert/strict");
const { test } = require("node:test");
const mongoose = require("mongoose");
const connectDatabase = require("../src/config/database");
const User = require("../src/models/User");
const Transaction = require("../src/models/Transaction");
const { handleMessage } = require("./handleMessage");
const fishConfig = require("../src/config/fish");

const userId = "inventory-test-user";
const otherUserId = "inventory-test-user-2";
const emptyUserId = "inventory-empty-test-user";
const missingUserId = "inventory-missing-test-user";
const userIds = [userId, otherUserId, emptyUserId];
const snapshotFields = "instagramId coins xp level workXp workLevel job workStartedAt jobSelectionPending inventory cooldowns";

function inventoryMessage(userId, text) {
    return {
        platform: "instagram",
        userId,
        username: "inventory_test_requester",
        messageId: `inventory-test-${Date.now()}`,
        text,
        timestamp: Date.now()
    };
}

test("/inventory displays public items and never changes database state", async () => {
    const createdUserIds = [];

    try {
        await connectDatabase();
        assert.equal(mongoose.connection.readyState, 1, "MongoDB should be connected");

        const existingUsers = await User.find({
            $or: [
                { instagramId: { $in: [...userIds, missingUserId] } },
                { username: { $in: ["inventory_test_user", "inventory_test_user_2", "inventory_empty_test_user"] } }
            ]
        }).select("instagramId").lean();
        assert.deepEqual(existingUsers, [], "inventory test accounts must not already exist");

        await User.create({
            instagramId: userId,
            username: "inventory_test_user",
            coins: 4321,
            xp: 123,
            level: 2,
            workXp: 34,
            workLevel: 1,
            job: "developer",
            workStartedAt: new Date("2026-09-27T10:00:00.000Z"),
            cooldowns: { fish: new Date("2026-09-27T11:00:00.000Z") },
            inventory: [
                { itemId: "sardine", quantity: 4 },
                { itemId: "clownfish", quantity: 2 },
                { itemId: "salmon", quantity: 7 },
                { itemId: "shark", quantity: 1 },
                { itemId: "removed-internal-item-id", quantity: 2 },
                { itemId: "invalid-zero-quantity", quantity: 0 },
                { itemId: "invalid-negative-quantity", quantity: -3 },
                { itemId: "invalid-fractional-quantity", quantity: 1.5 },
                { itemId: "invalid-string-quantity", quantity: "5" }
            ]
        });
        createdUserIds.push(userId);

        await User.create({
            instagramId: otherUserId,
            username: "inventory_test_user_2",
            coins: 800,
            xp: 45,
            level: 1,
            workXp: 9,
            workLevel: 1,
            job: "chef",
            inventory: [
                { itemId: "salmon", quantity: 3 },
                { itemId: "shark", quantity: 1 }
            ]
        });
        createdUserIds.push(otherUserId);

        await User.create({
            instagramId: emptyUserId,
            username: "inventory_empty_test_user",
            coins: 50,
            inventory: []
        });
        createdUserIds.push(emptyUserId);

        const beforeUsers = await User.find({ instagramId: { $in: userIds } })
            .select(snapshotFields)
            .lean();
        const beforeTransactions = await Transaction.countDocuments({
            $or: [{ from: { $in: userIds } }, { to: { $in: userIds } }]
        });

        const selfResponse = await handleMessage(inventoryMessage(userId, "/inventory"));
        const sardine = fishConfig.getFishByItemId("sardine");
        const clownfish = fishConfig.getFishByItemId("clownfish");
        const salmon = fishConfig.getFishByItemId("salmon");
        const shark = fishConfig.getFishByItemId("shark");
        assert.equal(selfResponse.type, "text");
        assert.ok(selfResponse.text.includes("🎒 @inventory_test_user's Inventory"));
        assert.ok(selfResponse.text.includes(`${sardine.emoji} ${sardine.name} × 4`));
        assert.ok(selfResponse.text.includes(`${clownfish.emoji} ${clownfish.name} × 2`));
        assert.ok(selfResponse.text.includes(`${salmon.emoji} ${salmon.name} × 7`));
        assert.ok(selfResponse.text.includes(`${shark.emoji} ${shark.name} × 1`));
        assert.ok(selfResponse.text.includes("❓ Unknown Item × 2"));
        assert.ok(selfResponse.text.includes("📦 Total Items: 16"));
        assert.ok(!selfResponse.text.includes("removed-internal-item-id"));
        assert.doesNotMatch(selfResponse.text, /inventory-test-user|ObjectId|instagramId|workStartedAt/);
        assert.ok(selfResponse.text.indexOf("Sardine") < selfResponse.text.indexOf("Clownfish"));
        assert.ok(selfResponse.text.indexOf("Clownfish") < selfResponse.text.indexOf("Salmon"));

        const otherResponse = await handleMessage(
            inventoryMessage(userId, "/inventory @INVENTORY_TEST_USER_2")
        );
        assert.ok(otherResponse.text.includes("🎒 @inventory_test_user_2's Inventory"));
        assert.ok(otherResponse.text.includes(`${salmon.emoji} ${salmon.name} × 3`));
        assert.ok(otherResponse.text.includes(`${shark.emoji} ${shark.name} × 1`));
        assert.ok(otherResponse.text.includes("📦 Total Items: 4"));
        assert.doesNotMatch(otherResponse.text, /inventory-test-user|ObjectId|instagramId|workStartedAt/);

        const otherWithoutAt = await handleMessage(
            inventoryMessage(userId, "/inventory inventory_test_user_2")
        );
        assert.ok(otherWithoutAt.text.includes("@inventory_test_user_2's Inventory"));

        const emptyResponse = await handleMessage(
            inventoryMessage(emptyUserId, "/inventory")
        );
        assert.ok(emptyResponse.text.includes("Your inventory is empty."));
        assert.ok(emptyResponse.text.includes("Use /fish to catch something!"));

        const usageResponse = await handleMessage(
            inventoryMessage(userId, "/inventory @inventory_test_user_2 extra")
        );
        assert.ok(usageResponse.text.includes("Usage: /inventory [@username]"));

        const missingUsernameResponse = await handleMessage(
            inventoryMessage(userId, "/inventory @missing_inventory_user")
        );
        assert.ok(missingUsernameResponse.text.includes("User Not Found"));
        assert.ok(missingUsernameResponse.text.includes("@missing_inventory_user"));
        assert.equal(await User.exists({ username: "missing_inventory_user" }), null);

        const missingOwnResponse = await handleMessage(
            inventoryMessage(missingUserId, "/inventory")
        );
        assert.ok(missingOwnResponse.text.includes("Inventory Not Found"));
        assert.equal(await User.exists({ instagramId: missingUserId }), null);

        const afterUsers = await User.find({ instagramId: { $in: userIds } })
            .select(snapshotFields)
            .lean();
        const afterTransactions = await Transaction.countDocuments({
            $or: [{ from: { $in: userIds } }, { to: { $in: userIds } }]
        });
        assert.deepEqual(afterUsers, beforeUsers);
        assert.equal(afterTransactions, beforeTransactions);
        assert.equal(await User.exists({ instagramId: missingUserId }), null);
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
