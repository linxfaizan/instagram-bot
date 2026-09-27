const shopItems = Object.freeze([
    { number: 1, itemId: "wooden_rod", name: "Wooden Rod", emoji: "🪵", price: 1_000 },
    { number: 2, itemId: "iron_rod", name: "Iron Rod", emoji: "🔩", price: 5_000 },
    { number: 3, itemId: "golden_rod", name: "Golden Rod", emoji: "🥇", price: 25_000 },
    { number: 4, itemId: "diamond_rod", name: "Diamond Rod", emoji: "💎", price: 100_000 },
    { number: 5, itemId: "silver_ring", name: "Silver Ring", emoji: "💍", price: 10_000 },
    { number: 6, itemId: "diamond_ring", name: "Diamond Ring", emoji: "💎", price: 50_000 },
    { number: 7, itemId: "royal_ring", name: "Royal Ring", emoji: "👑", price: 250_000 },
    { number: 8, itemId: "eternal_ring", name: "Eternal Ring", emoji: "♾️", price: 1_000_000 },
    { number: 9, itemId: "lucky_charm", name: "Lucky Charm", emoji: "🍀", price: 15_000 },
    { number: 10, itemId: "energy_drink", name: "Energy Drink", emoji: "⚡", price: 5_000 }
]);

const MAX_PURCHASE_QUANTITY = 1_000;
const marriageRingItemIds = Object.freeze([
    "silver_ring",
    "diamond_ring",
    "royal_ring",
    "eternal_ring"
]);

function validateShopConfiguration(items = shopItems) {
    if (!Array.isArray(items) || items.length !== 10) {
        throw new Error("Invalid shop configuration");
    }

    const numbers = new Set();
    const itemIds = new Set();
    for (const item of items) {
        if (
            !item ||
            !Number.isSafeInteger(item.number) ||
            item.number < 1 ||
            numbers.has(item.number) ||
            typeof item.itemId !== "string" ||
            item.itemId.trim() === "" ||
            itemIds.has(item.itemId) ||
            typeof item.name !== "string" ||
            item.name.trim() === "" ||
            typeof item.emoji !== "string" ||
            item.emoji.trim() === "" ||
            !Number.isSafeInteger(item.price) ||
            item.price <= 0
        ) {
            throw new Error("Invalid shop configuration");
        }
        numbers.add(item.number);
        itemIds.add(item.itemId);
    }

    if (
        !Number.isSafeInteger(MAX_PURCHASE_QUANTITY) ||
        MAX_PURCHASE_QUANTITY < 1 ||
        marriageRingItemIds.some((itemId) => !itemIds.has(itemId))
    ) {
        throw new Error("Invalid shop configuration");
    }

    return true;
}

function getShopItemByNumber(number) {
    return shopItems.find((item) => item.number === number) ?? null;
}

function getShopItemById(itemId) {
    return shopItems.find((item) => item.itemId === itemId) ?? null;
}

function getMarriageRingItems() {
    return marriageRingItemIds.map((itemId) => getShopItemById(itemId));
}

validateShopConfiguration();

module.exports = {
    shopItems,
    MAX_PURCHASE_QUANTITY,
    marriageRingItemIds,
    validateShopConfiguration,
    getShopItemByNumber,
    getShopItemById,
    getMarriageRingItems
};
