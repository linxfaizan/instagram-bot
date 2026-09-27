const { markCommandNotAccepted } = require("../services/rateLimitService");
const {
    MAX_PURCHASE_QUANTITY,
    getShopItemByNumber
} = require("../config/shop");
const { purchaseShopItem } = require("../services/shopService");
const { formatNumber } = require("../utils/formatNumber");

function notAccepted(text) {
    return markCommandNotAccepted({ type: "text", text });
}

function parsePositiveInteger(value) {
    if (typeof value !== "string" || !/^\d+$/.test(value)) {
        return null;
    }

    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

async function buyCommand({ message, args }) {
    if (!Array.isArray(args) || args.length < 1 || args.length > 2) {
        return notAccepted("❌ Usage: /buy <number> [quantity]");
    }

    const itemNumber = parsePositiveInteger(args[0]);
    const item = itemNumber ? getShopItemByNumber(itemNumber) : null;
    if (!item) {
        return notAccepted("❌ Invalid shop item.\n\nUse /shop to view available items.");
    }

    const quantity = args.length === 1 ? 1 : parsePositiveInteger(args[1]);
    if (!quantity || quantity > MAX_PURCHASE_QUANTITY) {
        return notAccepted(`❌ Quantity must be a positive whole number up to ${formatNumber(MAX_PURCHASE_QUANTITY)}.`);
    }

    const result = await purchaseShopItem(
        message.userId.trim(),
        message.username,
        itemNumber,
        quantity,
        message.messageId
    );

    if (result.status === "invalid_item") {
        return notAccepted("❌ Invalid shop item.\n\nUse /shop to view available items.");
    }
    if (result.status === "insufficient") {
        return notAccepted([
            "❌ Insufficient Coins",
            "",
            `${item.emoji} ${item.name} × ${quantity}`,
            `💰 Cost: ${formatNumber(result.totalCost)} coins`,
            `💵 Balance: ${formatNumber(result.balance)} coins`
        ].join("\n"));
    }

    return {
        type: "text",
        text: [
            "🛒 Purchase Complete!",
            "",
            `${item.emoji} ${item.name} × ${quantity}`,
            `💰 Cost: ${formatNumber(result.totalCost)} coins`,
            `💵 Balance: ${formatNumber(result.balance)} coins`
        ].join("\n")
    };
}

module.exports = buyCommand;
