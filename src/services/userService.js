const User = require("../models/User");

async function findUserByInstagramId(
    instagramId,
    projection = "username coins level xp job workLevel workXp"
) {
    if (typeof instagramId !== "string" || instagramId.trim() === "") {
        return null;
    }

    const query = User.findOne({ instagramId: instagramId.trim() });
    if (projection) {
        query.select(projection);
    }
    return query.lean();
}

function normalizeUsername(username) {
    if (typeof username !== "string") {
        return null;
    }

    const normalizedUsername = username.trim().replace(/^@/, "").toLowerCase();
    return normalizedUsername || null;
}

async function findUserByUsername(username, projection = null) {
    const normalizedUsername = normalizeUsername(username);
    if (!normalizedUsername) {
        return null;
    }

    const escapedUsername = normalizedUsername.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const query = User.findOne({
        username: new RegExp(`^${escapedUsername}$`, "i")
    });
    if (projection) {
        query.select(projection);
    }
    return query;
}

async function getCashLeaderboard(limit = 10) {
    if (!Number.isInteger(limit) || limit < 1) {
        throw new Error("Invalid leaderboard limit");
    }

    return User.find({})
        .select("instagramId username coins")
        .sort({ coins: -1, _id: 1 })
        .limit(Math.min(limit, 10))
        .lean();
}

async function getCashRankByInstagramId(instagramId) {
    if (typeof instagramId !== "string" || instagramId.trim() === "") {
        return null;
    }

    const user = await User.findOne({ instagramId: instagramId.trim() })
        .select("coins")
        .lean();
    if (!user) {
        return null;
    }

    const higherBalanceCount = await User.countDocuments({ coins: { $gt: user.coins } });
    return higherBalanceCount + 1;
}

async function addInventoryItem(instagramId, itemId, quantityOrSession = 1, session = null) {
    if (typeof instagramId !== "string" || instagramId.trim() === "") {
        throw new Error("Invalid Instagram ID");
    }
    if (typeof itemId !== "string" || itemId.trim() === "") {
        throw new Error("Invalid inventory item ID");
    }
    const quantityToAdd = typeof quantityOrSession === "number" ? quantityOrSession : 1;
    const transactionSession = typeof quantityOrSession === "number" ? session : quantityOrSession;

    if (!Number.isSafeInteger(quantityToAdd) || quantityToAdd <= 0) {
        throw new Error("Invalid inventory quantity");
    }

    const user = await User.findOne({ instagramId: instagramId.trim() }).session(transactionSession);
    if (!user) {
        throw new Error("User not found");
    }

    const inventory = Array.isArray(user.inventory)
        ? user.inventory.map((item) => item && typeof item === "object" ? { ...item } : item)
        : [];
    const existingEntries = inventory.filter((item) => item && item.itemId === itemId);
    const otherEntries = inventory.filter((item) => !item || item.itemId !== itemId);

    if (existingEntries.length > 0) {
        const existingQuantity = existingEntries.reduce((total, item) => {
            if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) {
                throw new Error("Invalid inventory item quantity");
            }
            return total + item.quantity;
        }, 0);

        if (!Number.isSafeInteger(existingQuantity + quantityToAdd)) {
            throw new Error("Inventory item quantity is too large");
        }

        otherEntries.push({ ...existingEntries[0], itemId, quantity: existingQuantity + quantityToAdd });
    } else {
        otherEntries.push({ itemId, quantity: quantityToAdd });
    }

    user.inventory = otherEntries;
    user.markModified("inventory");
    await user.save({ session: transactionSession });
    return user;
}

async function removeInventoryItem(instagramId, itemId, requestedQuantity, session = null) {
    if (typeof instagramId !== "string" || instagramId.trim() === "") {
        throw new Error("Invalid Instagram ID");
    }
    if (typeof itemId !== "string" || itemId.trim() === "") {
        throw new Error("Invalid inventory item ID");
    }
    if (requestedQuantity !== "all" && (!Number.isSafeInteger(requestedQuantity) || requestedQuantity <= 0)) {
        throw new Error("Invalid inventory quantity");
    }

    const user = await User.findOne({ instagramId: instagramId.trim() }).session(session);
    if (!user) {
        throw new Error("User not found");
    }

    const inventory = Array.isArray(user.inventory) ? user.inventory : [];
    const matchingEntries = inventory.filter((item) => item && item.itemId === itemId);
    if (matchingEntries.length === 0) {
        const error = new Error("Item not owned");
        error.code = "ITEM_NOT_OWNED";
        error.availableQuantity = 0;
        throw error;
    }

    const totalQuantity = matchingEntries.reduce((total, item) => {
        if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
            throw new Error("Invalid stored inventory quantity");
        }
        return total + BigInt(item.quantity);
    }, 0n);

    if (totalQuantity > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error("Inventory quantity is too large");
    }

    const availableQuantity = Number(totalQuantity);
    if (requestedQuantity !== "all" && requestedQuantity > availableQuantity) {
        const error = new Error("Insufficient inventory");
        error.code = "INSUFFICIENT_INVENTORY";
        error.availableQuantity = availableQuantity;
        throw error;
    }

    const quantityRemoved = requestedQuantity === "all" ? availableQuantity : requestedQuantity;
    const remainingQuantity = availableQuantity - quantityRemoved;
    const updatedInventory = [];
    let keptRemainingStack = false;

    for (const item of inventory) {
        if (item && item.itemId === itemId) {
            if (remainingQuantity > 0 && !keptRemainingStack) {
                updatedInventory.push({ ...item, itemId, quantity: remainingQuantity });
                keptRemainingStack = true;
            }
            continue;
        }
        updatedInventory.push(item);
    }

    user.inventory = updatedInventory;
    user.markModified("inventory");
    await user.save({ session });

    return { user, quantityRemoved, availableQuantity };
}

async function getOrCreateUser(instagramId, username) {
    if (typeof instagramId !== "string" || instagramId.trim() === "") {
        throw new TypeError("instagramId must be a non-empty string");
    }

    const normalizedId = instagramId.trim();
    const update = {
        $setOnInsert: { instagramId: normalizedId }
    };

    if (typeof username === "string" && username.trim() !== "") {
        update.$set = { username: username.trim() };
    }

    return User.findOneAndUpdate(
        { instagramId: normalizedId },
        update,
        {
            returnDocument: "after",
            upsert: true,
            runValidators: true,
            setDefaultsOnInsert: true
        }
    );
}

module.exports = {
    getOrCreateUser,
    findUserByInstagramId,
    findUserByUsername,
    normalizeUsername,
    getCashLeaderboard,
    getCashRankByInstagramId,
    addInventoryItem,
    removeInventoryItem
};
