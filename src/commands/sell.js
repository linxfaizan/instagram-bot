const mongoose = require("mongoose");
const {
    findUserByInstagramId,
    removeInventoryItem
} = require("../services/userService");
const { addCoins } = require("../services/economyService");
const { addUserXp } = require("../services/levelService");
const { getFishByItemId } = require("../config/fish");
const { SELL_XP } = require("../config/xp");
const { formatNumber } = require("../utils/formatNumber");

function usageResponse() {
    return {
        type: "text",
        text: "❌ Usage: /sell <number> <quantity>"
    };
}

function getSellableItems(inventory) {
    if (!Array.isArray(inventory)) {
        return [];
    }

    const itemsById = new Map();
    for (const entry of inventory) {
        if (
            !entry ||
            typeof entry.itemId !== "string" ||
            !Number.isSafeInteger(entry.quantity) ||
            entry.quantity <= 0
        ) {
            continue;
        }

        const fish = getFishByItemId(entry.itemId);
        if (!fish || !Number.isSafeInteger(fish.sellPrice) || fish.sellPrice <= 0) {
            continue;
        }

        const existing = itemsById.get(fish.itemId);
        const quantity = (existing?.quantity ?? 0n) + BigInt(entry.quantity);
        if (quantity <= BigInt(Number.MAX_SAFE_INTEGER)) {
            itemsById.set(fish.itemId, { fish, quantity });
        }
    }

    return [...itemsById.values()].map(({ fish, quantity }) => ({
        fish,
        quantity: Number(quantity)
    }));
}

function numberLabel(number) {
    const labels = ["", "1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"];
    return labels[number] || `${number}.`;
}

function formatSellMenu(items) {
    if (items.length === 0) {
        return {
            type: "text",
            text: "🎒 You have nothing to sell.\n\n🎣 Use /fish to catch something!"
        };
    }

    const lines = ["╭━━━ 💰 SELL ━━━╮", "", "🎒 Your Fish", ""];
    items.forEach(({ fish, quantity }, index) => {
        const totalPrice = BigInt(quantity) * BigInt(fish.sellPrice);
        lines.push(`${numberLabel(index + 1)} ${fish.emoji} ${fish.name} × ${formatNumber(quantity)}`);
        lines.push(`   💰 ${formatNumber(fish.sellPrice)} each → ${formatNumber(totalPrice)} total`);
        lines.push("");
    });
    lines.push(
        "━━━━━━━━━━━━━━━━━━",
        "💰 Use:",
        "/sell <number> <quantity>",
        "",
        "Example:",
        "/sell 3 2",
        "",
        "Sell all:",
        "/sell 3 all",
        "╰━━━━━━━━━━━━━━━━╯"
    );

    return { type: "text", text: lines.join("\n") };
}

function formatSale(quantity, fish, totalPrice) {
    return {
        type: "text",
        text: `💰 Sale Complete! 🎉\n\n${fish.emoji} ${fish.name} × ${formatNumber(quantity)}\n💰 Earned: ${formatNumber(totalPrice)} coins\n\n✨ +${SELL_XP} XP`
    };
}

function formatSaleError(error, fish) {
    if (error.code === "ITEM_NOT_OWNED") {
        return {
            type: "text",
            text: `❌ You don't have any ${fish.name}.`
        };
    }

    if (error.code === "INSUFFICIENT_INVENTORY") {
        return {
            type: "text",
            text: `❌ You only have ${formatNumber(error.availableQuantity)}x ${fish.name}.`
        };
    }

    if (error.message === "Sale amount is too large to process safely") {
        return {
            type: "text",
            text: "❌ Sale amount is too large to process safely."
        };
    }

    return {
        type: "text",
        text: "❌ Sale could not be completed. Please try again."
    };
}

async function sellCommand({ message, args }) {
    if (!Array.isArray(args)) {
        return usageResponse();
    }

    if (args.length === 0) {
        const user = await findUserByInstagramId(message.userId, "username inventory");
        return formatSellMenu(getSellableItems(user?.inventory));
    }

    if (args.length !== 2 || !/^\d+$/.test(args[0])) {
        return usageResponse();
    }

    const itemNumber = Number(args[0]);
    if (!Number.isSafeInteger(itemNumber) || itemNumber <= 0) {
        return usageResponse();
    }

    const rawQuantity = args[1].toLowerCase();
    let requestedQuantity;
    if (rawQuantity === "all") {
        requestedQuantity = "all";
    } else if (/^\d+$/.test(rawQuantity)) {
        requestedQuantity = Number(rawQuantity);
        if (!Number.isSafeInteger(requestedQuantity) || requestedQuantity <= 0) {
            return {
                type: "text",
                text: "❌ Invalid quantity.\n\nUse a positive whole number or `all`."
            };
        }
    } else {
        return {
            type: "text",
            text: "❌ Invalid quantity.\n\nUse a positive whole number or `all`."
        };
    }

    const user = await findUserByInstagramId(message.userId, "username inventory");
    const sellableItems = getSellableItems(user?.inventory);
    const selectedItem = sellableItems[itemNumber - 1];
    if (!selectedItem) {
        return {
            type: "text",
            text: "❌ Invalid sell item.\n\nUse /sell to see your available items."
        };
    }

    const instagramId = message.userId.trim();
    const session = await mongoose.startSession();
    let saleResult;

    try {
        saleResult = await session.withTransaction(async () => {
            const removal = await removeInventoryItem(
                instagramId,
                selectedItem.fish.itemId,
                requestedQuantity,
                session
            );
            const totalBigInt = BigInt(removal.quantityRemoved) * BigInt(selectedItem.fish.sellPrice);
            if (totalBigInt <= 0n || totalBigInt > BigInt(Number.MAX_SAFE_INTEGER)) {
                throw new Error("Sale amount is too large to process safely");
            }

            const totalPrice = Number(totalBigInt);
            if (
                !Number.isSafeInteger(removal.user.coins) ||
                !Number.isSafeInteger(removal.user.coins + totalPrice)
            ) {
                throw new Error("Sale amount is too large to process safely");
            }

            const updatedUser = await addCoins(
                instagramId,
                totalPrice,
                "sell",
                {
                    itemId: selectedItem.fish.itemId,
                    quantity: removal.quantityRemoved,
                    unitPrice: selectedItem.fish.sellPrice,
                    totalPrice
                },
                session
            );
            await addUserXp(instagramId, SELL_XP, session);

            return {
                quantity: removal.quantityRemoved,
                totalPrice,
                balance: updatedUser.coins,
                fish: selectedItem.fish
            };
        });
    } catch (error) {
        return formatSaleError(error, selectedItem.fish);
    } finally {
        await session.endSession();
    }

    return formatSale(saleResult.quantity, saleResult.fish, saleResult.totalPrice);
}

module.exports = sellCommand;
