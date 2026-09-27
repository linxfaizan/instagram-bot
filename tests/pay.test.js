require("dotenv").config();

const assert = require("node:assert/strict");
const { test } = require("node:test");
const mongoose = require("mongoose");
const connectDatabase = require("../src/config/database");
const User = require("../src/models/User");
const Transaction = require("../src/models/Transaction");
const { handleMessage } = require("./handleMessage");
const { parseAmount } = require("../src/utils/parseAmount");
const { PAY_XP } = require("../src/config/xp");

const senderId = "eco-bot-pay-sender";
const recipientId = "eco-bot-pay-recipient";

function payMessage(text) {
    return {
        platform: "instagram",
        userId: senderId,
        username: "pay_sender_test",
        messageId: `eco-bot-pay-test-${Date.now()}-${Math.random()}`,
        text,
        timestamp: Date.now()
    };
}

test("parseAmount accepts exact whole-coin formats and rejects unsafe inputs", () => {
    const validAmounts = [
        ["500", 500],
        ["10000", 10000],
        ["1k", 1000],
        ["1.4k", 1400],
        ["1.4K", 1400],
        ["1.5k", 1500],
        ["1.6m", 1600000],
        ["2.75M", 2750000],
        ["3.6b", 3600000000],
        ["4t", 4000000000000],
        ["4T", 4000000000000],
        ["1,000", 1000],
        ["10,000", 10000],
        ["1,000.5k", 1000500],
        ["9007199254740991", Number.MAX_SAFE_INTEGER]
    ];

    for (const [input, expected] of validAmounts) {
        assert.equal(parseAmount(input), expected, input);
    }

    const invalidAmounts = [
        "abc",
        "1x",
        "1kk",
        "1.5.5k",
        "-500",
        "-1k",
        "0",
        "NaN",
        "Infinity",
        "1.2.3m",
        "1,00",
        "10,00",
        "1,0000",
        "1.5",
        "1.0001k"
    ];

    for (const input of invalidAmounts) {
        assert.throws(() => parseAmount(input), /Invalid amount|whole number of coins/, input);
    }

    assert.throws(
        () => parseAmount("9007199254740992"),
        /too large to process safely/
    );
});

test("/pay finds recipients by username and transfers by Instagram ID", async () => {
    const createdUserIds = [];

    try {
        await connectDatabase();
        assert.equal(mongoose.connection.readyState, 1, "MongoDB should be connected");

        const existingUsers = await User.find({
            $or: [
                { instagramId: { $in: [senderId, recipientId] } },
                { username: { $in: ["pay_sender_test", "pay_recipient_test"] } }
            ]
        }).select("instagramId").lean();
        assert.deepEqual(existingUsers, [], "pay test accounts must not already exist");

        await User.create({
            instagramId: senderId,
            username: "pay_sender_test",
            coins: 3000
        });
        createdUserIds.push(senderId);
        await User.create({
            instagramId: recipientId,
            username: "pay_recipient_test",
            coins: 100
        });
        createdUserIds.push(recipientId);

        const firstResponse = await handleMessage(payMessage("/pay @PAY_RECIPIENT_TEST 500"));
        assert.ok(firstResponse.text.includes("Payment Successful!"));
        assert.ok(firstResponse.text.includes("You paid @pay_recipient_test 500 coins."));
        assert.ok(firstResponse.text.includes("Your balance: 2,500 coins"));

        let sender = await User.findOne({ instagramId: senderId });
        let recipient = await User.findOne({ instagramId: recipientId });
        assert.equal(sender.coins, 2500);
        assert.equal(sender.xp, PAY_XP);
        assert.equal(recipient.coins, 600);

        let transactions = await Transaction.find({
            type: "pay",
            from: senderId,
            to: recipientId
        });
        assert.equal(transactions.length, 1);
        assert.equal(transactions[0].amount, 500);
        assert.equal(transactions[0].from, senderId);
        assert.equal(transactions[0].to, recipientId);
        assert.equal(transactions[0].metadata.recipientUsername, "pay_recipient_test");

        const suffixResponse = await handleMessage(payMessage("/pay @pay_recipient_test 1.4k"));
        assert.ok(suffixResponse.text.includes("You paid @pay_recipient_test 1,400 coins."));
        assert.ok(suffixResponse.text.includes("Your balance: 1,100 coins"));

        sender = await User.findOne({ instagramId: senderId });
        recipient = await User.findOne({ instagramId: recipientId });
        assert.equal(sender.coins, 1100);
        assert.equal(sender.xp, PAY_XP * 2);
        assert.equal(recipient.coins, 2000);
        transactions = await Transaction.find({
            type: "pay",
            from: senderId,
            to: recipientId,
            amount: 1400
        });
        assert.equal(transactions.length, 1);
        assert.equal(transactions[0].amount, 1400);

        const noAtResponse = await handleMessage(payMessage("/pay pay_recipient_test 100"));
        assert.ok(noAtResponse.text.includes("Payment Successful!"));
        assert.ok(noAtResponse.text.includes("You paid @pay_recipient_test 100 coins."));

        sender = await User.findOne({ instagramId: senderId });
        recipient = await User.findOne({ instagramId: recipientId });
        assert.equal(sender.coins, 1000);
        assert.equal(sender.xp, PAY_XP * 3);
        assert.equal(recipient.coins, 2100);
        assert.equal(await Transaction.countDocuments({
            type: "pay",
            from: senderId,
            to: recipientId
        }), 3);

        const failedPaymentCount = await Transaction.countDocuments({
            type: "pay",
            from: senderId
        });
        const failedPaymentCases = [
            "/pay",
            "/pay @pay_recipient_test",
            "/pay @pay_recipient_test 0",
            "/pay @pay_recipient_test -100",
            "/pay @pay_recipient_test abc",
            "/pay @pay_recipient_test NaN",
            "/pay @pay_recipient_test Infinity",
            "/pay @pay_recipient_test 1x",
            "/pay @pay_recipient_test 1kk",
            "/pay @pay_recipient_test 1.5.5k",
            "/pay @pay_recipient_test 1,00",
            "/pay @pay_recipient_test 9007199254740992",
            "/pay @missing_pay_user 10"
        ];

        for (const text of failedPaymentCases) {
            const response = await handleMessage(payMessage(text));
            assert.equal(response.type, "text");
            assert.ok(response.text.includes("❌"), `expected failure response for ${text}`);
        }

        const missingRecipientResponse = await handleMessage(
            payMessage("/pay @Missing_Pay_User 10")
        );
        assert.ok(missingRecipientResponse.text.includes("I couldn't find @missing_pay_user."));

        const selfPaymentResponse = await handleMessage(
            payMessage("/pay @PAY_SENDER_TEST 10")
        );
        assert.ok(selfPaymentResponse.text.includes("You can't pay yourself."));

        const insufficientResponse = await handleMessage(
            payMessage("/pay @pay_recipient_test 1001")
        );
        assert.ok(insufficientResponse.text.includes("Insufficient Coins"));
        assert.ok(insufficientResponse.text.includes("You only have 1,000 coins."));
        assert.ok(insufficientResponse.text.includes("You cannot pay 1,001 coins."));

        sender = await User.findOne({ instagramId: senderId });
        recipient = await User.findOne({ instagramId: recipientId });
        assert.equal(sender.coins, 1000);
        assert.equal(sender.xp, PAY_XP * 3, "failed payments award no XP");
        assert.equal(recipient.coins, 2100);
        assert.equal(await Transaction.countDocuments({
            type: "pay",
            from: senderId
        }), failedPaymentCount);

        const concurrentResponses = await Promise.all([
            handleMessage(payMessage("/pay @pay_recipient_test 600")),
            handleMessage(payMessage("/pay @pay_recipient_test 600"))
        ]);
        assert.equal(
            concurrentResponses.filter((response) => response.text.includes("Payment Successful"))
                .length,
            1
        );
        assert.equal(
            concurrentResponses.filter((response) => response.text.includes("Insufficient Coins"))
                .length,
            1
        );

        sender = await User.findOne({ instagramId: senderId });
        recipient = await User.findOne({ instagramId: recipientId });
        assert.equal(sender.coins, 400);
        assert.equal(sender.xp, PAY_XP * 4);
        assert.equal(recipient.coins, 2700);
        assert.equal(await Transaction.countDocuments({
            type: "pay",
            from: senderId,
            to: recipientId
        }), 4);
    } finally {
        if (mongoose.connection.readyState === 1) {
            try {
                if (createdUserIds.length > 0) {
                    await Transaction.deleteMany({
                        type: "pay",
                        from: { $in: createdUserIds }
                    });
                    await User.deleteMany({ instagramId: { $in: createdUserIds } });
                }
            } finally {
                await mongoose.disconnect();
            }
        }
    }
});
