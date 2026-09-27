const {
    findUserByInstagramId,
    findUserByUsername,
    normalizeUsername
} = require("../services/userService");
const { getFishByItemId } = require("../config/fish");
const { formatNumber } = require("../utils/formatNumber");

function formatInventory(user) {
    const username = normalizeUsername(user.username) || "unknown";
    const lines = [`🎒 @${username}'s Inventory`, ""];
    const inventory = Array.isArray(user.inventory) ? user.inventory : [];
    const displayEntries = [];
    let totalItems = 0n;

    for (const entry of inventory) {
        if (
            !entry ||
            typeof entry !== "object" ||
            typeof entry.itemId !== "string" ||
            !Number.isSafeInteger(entry.quantity) ||
            entry.quantity <= 0
        ) {
            continue;
        }

        const fish = getFishByItemId(entry.itemId);
        const label = fish ? `${fish.emoji} ${fish.name}` : "❓ Unknown Item";
        displayEntries.push(`${label} × ${formatNumber(entry.quantity)}`);
        totalItems += BigInt(entry.quantity);
    }

    if (displayEntries.length === 0) {
        lines.push("Your inventory is empty.", "", "🎣 Use /fish to catch something!");
    } else {
        lines.push(...displayEntries, "", `📦 Total Items: ${formatNumber(totalItems)}`);
    }

    return lines.join("\n");
}

async function inventoryCommand({ message, args }) {
    if (!Array.isArray(args) || args.length > 1) {
        return {
            type: "text",
            text: "❌ Usage: /inventory [@username]"
        };
    }

    let user;
    if (args.length === 0) {
        user = await findUserByInstagramId(message.userId, "username inventory");
        if (!user) {
            return {
                type: "text",
                text: "❌ Inventory Not Found\n\nYour Eco-Bot account does not exist yet."
            };
        }
    } else {
        const username = normalizeUsername(args[0]);
        if (!username || !/^[a-z0-9._]+$/.test(username)) {
            return {
                type: "text",
                text: "❌ Usage: /inventory [@username]"
            };
        }

        user = await findUserByUsername(username, "instagramId username inventory");
        if (!user) {
            return {
                type: "text",
                text: `❌ User Not Found\n\nI couldn't find @${username}.`
            };
        }
    }

    return { type: "text", text: formatInventory(user) };
}

module.exports = inventoryCommand;
