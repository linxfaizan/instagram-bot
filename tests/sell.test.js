require("dotenv").config();

const assert = require("node:assert/strict");
const { test } = require("node:test");
const mongoose = require("mongoose");
const connectDatabase = require("../src/config/database");
const User = require("../src/models/User");
const Transaction = require("../src/models/Transaction");
const { handleMessage } = require("./handleMessage");
const fishConfig = require("../src/config/fish");
const { SELL_XP } = require("../src/config/xp");

const mainId = "sell-test-user";
const raceId = "sell-concurrent-test-user";
const emptyId = "sell-empty-test-user";
const ids = [mainId, raceId, emptyId];
let messageIndex = 0;

function message(userId, text) {
    return {
        platform: "instagram",
        userId,
        username: "sell_test_user",
        messageId: `sell-test-message-${messageIndex++}`,
        text,
        timestamp: Date.now()
    };
}

async function sellTransactions(userId) {
    return Transaction.find({ to: userId, type: "sell" }).sort({ timestamp: 1 }).lean();
}

test("/sell menu uses current inventory numbers and sales remain atomic", async () => {
    const createdIds = [];
    let originalTransactionCreate;

    try {
        await connectDatabase();
        assert.equal(mongoose.connection.readyState, 1);
        assert.deepEqual(
            await User.find({ instagramId: { $in: ids } }).select("instagramId").lean(),
            []
        );

        const expectedPrices = {
            sardine: 25,
            clownfish: 50,
            salmon: 100,
            pufferfish: 150,
            squid: 250,
            crab: 300,
            shark: 750,
            whale: 2500,
            "golden-fish": 10000
        };
        for (const [itemId, price] of Object.entries(expectedPrices)) {
            assert.equal(fishConfig.getFishByItemId(itemId).sellPrice, price);
        }

        await User.create({
            instagramId: mainId,
            username: "sell_test_user",
            coins: 500,
            xp: 10,
            workXp: 20,
            workLevel: 3,
            job: "chef",
            cooldowns: { fish: new Date("2026-09-27T12:00:00.000Z") },
            inventory: [
                { itemId: "salmon", quantity: 3 },
                { itemId: "golden-fish", quantity: 2 },
                { itemId: "sardine", quantity: 5 },
                { itemId: "removed-fish", quantity: 9 },
                { itemId: "clownfish", quantity: 0 },
                { itemId: "shark", quantity: -1 }
            ]
        });
        createdIds.push(mainId);
        await User.create({
            instagramId: raceId,
            username: "sell_concurrent_test_user",
            coins: 100,
            xp: 0,
            inventory: [{ itemId: "salmon", quantity: 1 }]
        });
        createdIds.push(raceId);
        await User.create({
            instagramId: emptyId,
            username: "sell_empty_test_user",
            coins: 50,
            xp: 0,
            inventory: []
        });
        createdIds.push(emptyId);

        const menu = await handleMessage(message(mainId, "/sell"));
        assert.ok(menu.text.includes("╭━━━ 💰 SELL ━━━╮"));
        assert.ok(menu.text.includes("1️⃣ 🐟 Salmon × 3"));
        assert.ok(menu.text.includes("💰 100 each → 300 total"));
        assert.ok(menu.text.includes("2️⃣ ✨ Golden Fish × 2"));
        assert.ok(menu.text.includes("💰 10,000 each → 20,000 total"));
        assert.ok(menu.text.includes("3️⃣ 🐟 Sardine × 5"));
        assert.ok(!menu.text.includes("Shark"));
        assert.ok(!menu.text.includes("Clownfish"));
        assert.ok(!menu.text.includes("removed-fish"));
        assert.ok(menu.text.includes("/sell <number> <quantity>"));
        assert.ok(menu.text.includes("/sell 3 all"));

        const secondItemSale = await handleMessage(message(mainId, "/sell 2 1"));
        assert.ok(secondItemSale.text.includes("✨ Golden Fish × 1"));
        assert.ok(secondItemSale.text.includes("Sale Complete!"));
        assert.ok(secondItemSale.text.includes("Earned: 10,000 coins"));
        let user = await User.findOne({ instagramId: mainId });
        assert.equal(user.coins, 10500);
        assert.equal(user.xp, 10 + SELL_XP);
        assert.equal(user.workXp, 20);
        assert.equal(user.workLevel, 3);
        assert.equal(user.job, "chef");
        assert.equal(user.inventory.find((item) => item.itemId === "golden-fish").quantity, 1);
        assert.equal(user.inventory.find((item) => item.itemId === "salmon").quantity, 3);

        let transactions = await sellTransactions(mainId);
        assert.equal(transactions.length, 1);
        assert.equal(transactions[0].amount, 10000);
        assert.deepEqual(transactions[0].metadata, {
            itemId: "golden-fish",
            quantity: 1,
            unitPrice: 10000,
            totalPrice: 10000
        });

        const beforeInvalid = await User.findOne({ instagramId: mainId })
            .select("coins xp inventory cooldowns")
            .lean();
        for (const text of [
            "/sell 3",
            "/sell abc 2",
            "/sell 99 1",
            "/sell 1 0",
            "/sell 1 -1",
            "/sell 1 1.5",
            "/sell 1 abc",
            "/sell 1 1k",
            "/sell 1 1 2",
            "/sell 1 99"
        ]) {
            const response = await handleMessage(message(mainId, text));
            assert.ok(response.text.startsWith("❌"), `expected rejection for ${text}`);
        }
        user = await User.findOne({ instagramId: mainId }).select("coins xp inventory cooldowns").lean();
        assert.deepEqual(user, beforeInvalid);
        assert.equal((await sellTransactions(mainId)).length, 1);
        assert.ok((await handleMessage(message(mainId, "/sell 99 1"))).text.includes("Invalid sell item"));
        assert.ok((await handleMessage(message(mainId, "/sell 1 0"))).text.includes("Invalid quantity"));
        assert.ok((await handleMessage(message(mainId, "/sell 1 99"))).text.includes("only have 3x Salmon"));

        const partialSale = await handleMessage(message(mainId, "/sell 1 1"));
        assert.ok(partialSale.text.includes("🐟 Salmon × 1"));
        assert.ok(partialSale.text.includes("Earned: 100 coins"));
        const salmonRemaining = await User.findOne({ instagramId: mainId });
        assert.equal(salmonRemaining.inventory.find((item) => item.itemId === "salmon").quantity, 2);
        assert.equal(salmonRemaining.coins, 10600);

        const allSalmonSale = await handleMessage(message(mainId, "/sell 1 all"));
        assert.ok(allSalmonSale.text.includes("🐟 Salmon × 2"));
        assert.ok(allSalmonSale.text.includes("Earned: 200 coins"));
        user = await User.findOne({ instagramId: mainId });
        assert.equal(user.inventory.some((item) => item.itemId === "salmon"), false);
        assert.equal(user.coins, 10800);

        const reshuffledMenu = await handleMessage(message(mainId, "/sell"));
        assert.ok(reshuffledMenu.text.includes("1️⃣ ✨ Golden Fish × 1"));
        assert.ok(reshuffledMenu.text.includes("2️⃣ 🐟 Sardine × 5"));
        assert.ok(!reshuffledMenu.text.includes("3️⃣"));
        const allGoldenSale = await handleMessage(message(mainId, "/sell 1 all"));
        assert.ok(allGoldenSale.text.includes("✨ Golden Fish × 1"));
        assert.ok(allGoldenSale.text.includes("Earned: 10,000 coins"));

        const sardineSale = await handleMessage(message(mainId, "/sell 1 2"));
        assert.ok(sardineSale.text.includes("🐟 Sardine × 2"));
        assert.ok(sardineSale.text.includes("Earned: 50 coins"));
        user = await User.findOne({ instagramId: mainId });
        assert.equal(user.coins, 20850);
        assert.equal(user.xp, 10 + SELL_XP * 5);
        assert.equal(user.inventory.find((item) => item.itemId === "sardine").quantity, 3);
        transactions = await sellTransactions(mainId);
        assert.equal(transactions.length, 5);
        assert.deepEqual(transactions.map((transaction) => transaction.metadata.itemId), [
            "golden-fish", "salmon", "salmon", "golden-fish", "sardine"
        ]);
        assert.equal(transactions[4].amount, 50);
        assert.deepEqual(transactions[4].metadata, {
            itemId: "sardine",
            quantity: 2,
            unitPrice: 25,
            totalPrice: 50
        });

        await User.updateOne(
            { instagramId: mainId },
            { $push: { inventory: { itemId: "salmon", quantity: 1 } } }
        );
        const beforeRollback = await User.findOne({ instagramId: mainId })
            .select("coins xp workXp workLevel job inventory cooldowns")
            .lean();
        const transactionsBeforeRollback = (await sellTransactions(mainId)).length;
        originalTransactionCreate = Transaction.create;
        Transaction.create = async () => {
            throw new Error("controlled ledger write failure");
        };
        const rollbackResponse = await handleMessage(message(mainId, "/sell 2 1"));
        Transaction.create = originalTransactionCreate;
        originalTransactionCreate = null;
        assert.ok(rollbackResponse.text.includes("Sale could not be completed"));
        const afterRollback = await User.findOne({ instagramId: mainId })
            .select("coins xp workXp workLevel job inventory cooldowns")
            .lean();
        assert.deepEqual(afterRollback, beforeRollback);
        assert.equal((await sellTransactions(mainId)).length, transactionsBeforeRollback);

        const emptyMenu = await handleMessage(message(emptyId, "/sell"));
        assert.ok(emptyMenu.text.includes("🎒 You have nothing to sell."));
        assert.ok(emptyMenu.text.includes("Use /fish to catch something!"));
        assert.ok((await handleMessage(message(emptyId, "/sell 1 1"))).text.includes("Invalid sell item"));
        const emptyUser = await User.findOne({ instagramId: emptyId });
        assert.equal(emptyUser.coins, 50);
        assert.equal(emptyUser.xp, 0);
        assert.deepEqual(emptyUser.inventory, []);
        assert.equal((await sellTransactions(emptyId)).length, 0);

        const raceBefore = await User.findOne({ instagramId: raceId }).lean();
        const raceResponses = await Promise.all([
            handleMessage(message(raceId, "/sell 1 1")),
            handleMessage(message(raceId, "/sell 1 1"))
        ]);
        assert.equal(raceResponses.filter((response) => response.text.includes("Sale Complete!")).length, 1);
        assert.equal(raceResponses.filter((response) => response.text.includes("don't have any Salmon")).length, 1);
        const raceAfter = await User.findOne({ instagramId: raceId });
        assert.equal(raceAfter.coins, raceBefore.coins + 100);
        assert.equal(raceAfter.xp, raceBefore.xp + SELL_XP);
        assert.deepEqual(raceAfter.inventory, []);
        assert.equal((await sellTransactions(raceId)).length, 1);
    } finally {
        if (originalTransactionCreate) {
            Transaction.create = originalTransactionCreate;
        }
        if (mongoose.connection.readyState === 1) {
            try {
                if (createdIds.length > 0) {
                    await Transaction.deleteMany({ to: { $in: createdIds }, type: "sell" });
                    await User.deleteMany({ instagramId: { $in: createdIds } });
                }
            } finally {
                await mongoose.disconnect();
            }
        }
    }
});
