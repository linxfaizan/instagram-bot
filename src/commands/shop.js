const { getShopBalance } = require("../services/shopService");
const { shopItems } = require("../config/shop");
const { formatNumber } = require("../utils/formatNumber");

async function shopCommand({ message, args }) {
    if (!Array.isArray(args) || args.length > 0) {
        return { type: "text", text: "❌ Usage: /shop" };
    }

    const balance = await getShopBalance(message.userId.trim(), message.username);
    const lines = ["🛒 SHOP", "", `💰 Balance: ${formatNumber(balance)}`, ""];

    for (const item of shopItems) {
        lines.push(`${item.number}. ${item.emoji} ${item.name} — ${formatNumber(item.price)}`);
    }

    lines.push("", "Use /buy <number> [quantity]");
    return { type: "text", text: lines.join("\n") };
}

module.exports = shopCommand;
