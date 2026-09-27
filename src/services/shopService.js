const mongoose = require("mongoose");
const User = require("../models/User");
const {
    addInventoryItem,
    getOrCreateUser
} = require("./userService");
const { removeCoins } = require("./economyService");
const {
    MAX_PURCHASE_QUANTITY,
    getShopItemByNumber
} = require("../config/shop");

function validateQuantity(quantity) {
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_PURCHASE_QUANTITY) {
        throw new Error("Invalid purchase quantity");
    }
}

function calculatePurchaseCost(item, quantity) {
    validateQuantity(quantity);
    if (!item || !Number.isSafeInteger(item.price) || item.price <= 0) {
        throw new Error("Invalid shop item");
    }

    const total = BigInt(item.price) * BigInt(quantity);
    if (total > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error("Purchase cost is too large to process safely");
    }
    return Number(total);
}

async function getShopBalance(instagramId, username) {
    const user = await getOrCreateUser(instagramId, username);
    return user.coins;
}

async function purchaseShopItem(instagramId, username, itemNumber, quantity, messageId) {
    if (!Number.isSafeInteger(itemNumber) || itemNumber < 1) {
        return { status: "invalid_item" };
    }

    const item = getShopItemByNumber(itemNumber);
    if (!item) {
        return { status: "invalid_item" };
    }

    validateQuantity(quantity);
    const totalCost = calculatePurchaseCost(item, quantity);
    await getOrCreateUser(instagramId, username);

    const session = await mongoose.startSession();
    try {
        return await session.withTransaction(async () => {
            const user = await User.findOne({ instagramId })
                .select("coins")
                .session(session);
            if (!user) {
                throw new Error("User not found");
            }
            if (!Number.isSafeInteger(user.coins) || user.coins < totalCost) {
                return {
                    status: "insufficient",
                    item,
                    quantity,
                    totalCost,
                    balance: user.coins
                };
            }

            const updatedUser = await removeCoins(
                instagramId,
                totalCost,
                "shop_purchase",
                {
                    itemId: item.itemId,
                    itemNumber: item.number,
                    quantity,
                    unitPrice: item.price,
                    totalCost,
                    messageId: messageId || null
                },
                session
            );
            await addInventoryItem(instagramId, item.itemId, quantity, session);

            return {
                status: "purchased",
                item,
                quantity,
                totalCost,
                balance: updatedUser.coins
            };
        });
    } finally {
        await session.endSession();
    }
}

module.exports = {
    validateQuantity,
    calculatePurchaseCost,
    getShopBalance,
    purchaseShopItem
};
