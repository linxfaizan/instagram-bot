const mongoose = require("mongoose");
const { getOrCreateUser, findUserByUsername, normalizeUsername } = require("../services/userService");
const { getBalance, transferCoins } = require("../services/economyService");
const { parseAmount } = require("../utils/parseAmount");
const { addUserXp } = require("../services/levelService");
const { PAY_XP } = require("../config/xp");

function invalidPaymentResponse() {
    return {
        type: "text",
        text: "❌ Invalid payment\n\nUsage:\n/pay @username <amount>\n\nExample:\n/pay @rahul_123 500\n\nThe amount must be a positive whole number of coins."
    };
}

async function payCommand({ message, args }) {
    if (!Array.isArray(args) || args.length !== 2) {
        return invalidPaymentResponse();
    }

    const username = normalizeUsername(args[0]);
    if (!username || !/^[a-z0-9._]+$/.test(username)) {
        return invalidPaymentResponse();
    }

    let amount;
    try {
        amount = parseAmount(args[1]);
    } catch (error) {
        if (error.message === "Amount is too large to process safely") {
            return {
                type: "text",
                text: "❌ Invalid amount\n\nThe amount is too large to process safely."
            };
        }

        return invalidPaymentResponse();
    }

    const recipient = await findUserByUsername(username);
    if (!recipient) {
        return {
            type: "text",
            text: `❌ User Not Found\n\nI couldn't find @${username}.`
        };
    }

    const senderId = message.userId.trim();
    if (recipient.instagramId === senderId) {
        return {
            type: "text",
            text: "❌ You can't pay yourself."
        };
    }

    try {
        await getOrCreateUser(senderId, message.username);
        const session = await mongoose.startSession();
        let transfer;
        try {
            transfer = await session.withTransaction(async () => {
                const result = await transferCoins(
                    senderId,
                    recipient.instagramId,
                    amount,
                    { recipientUsername: recipient.username },
                    session
                );
                await addUserXp(senderId, PAY_XP, session);
                return result;
            });
        } finally {
            await session.endSession();
        }
        const recipientUsername = normalizeUsername(recipient.username) || username;

        return {
            type: "text",
            text: `💸 Payment Successful!\n\nYou paid @${recipientUsername} ${amount.toLocaleString("en-US")} coins. 💰\n\nYour balance: ${transfer.from.coins.toLocaleString("en-US")} coins`
        };
    } catch (error) {
        if (error.message === "Insufficient coins") {
            const balance = await getBalance(senderId);
            return {
                type: "text",
                text: `❌ Insufficient Coins\n\nYou only have ${balance.coins.toLocaleString("en-US")} coins.\nYou cannot pay ${amount.toLocaleString("en-US")} coins.`
            };
        }

        return {
            type: "text",
            text: "❌ Payment could not be completed. Please try again."
        };
    }
}

module.exports = payCommand;