const fishTypes = [
    { itemId: "sardine", name: "Sardine", emoji: "🐟", rarity: "common", sellPrice: 25 },
    { itemId: "clownfish", name: "Clownfish", emoji: "🐠", rarity: "common", sellPrice: 50 },
    { itemId: "salmon", name: "Salmon", emoji: "🐟", rarity: "uncommon", sellPrice: 100 },
    { itemId: "pufferfish", name: "Pufferfish", emoji: "🐡", rarity: "uncommon", sellPrice: 150 },
    { itemId: "squid", name: "Squid", emoji: "🦑", rarity: "rare", sellPrice: 250 },
    { itemId: "crab", name: "Crab", emoji: "🦀", rarity: "rare", sellPrice: 300 },
    { itemId: "shark", name: "Shark", emoji: "🦈", rarity: "epic", sellPrice: 750 },
    { itemId: "whale", name: "Whale", emoji: "🐋", rarity: "legendary", sellPrice: 2500 },
    { itemId: "golden-fish", name: "Golden Fish", emoji: "✨", rarity: "mythic", sellPrice: 10000 }
];

const rarityWeights = {
    common: 50,
    uncommon: 25,
    rare: 15,
    epic: 7,
    legendary: 2.5,
    mythic: 0.5
};

function validateFishConfiguration(fish = fishTypes, weights = rarityWeights) {
    if (!Array.isArray(fish) || fish.length === 0 || !weights || typeof weights !== "object") {
        throw new Error("Invalid fish configuration");
    }

    const itemIds = new Set();
    for (const fishType of fish) {
        if (
            !fishType ||
            typeof fishType.itemId !== "string" ||
            fishType.itemId.trim() === "" ||
            itemIds.has(fishType.itemId) ||
            typeof fishType.name !== "string" ||
            fishType.name.trim() === "" ||
            typeof fishType.emoji !== "string" ||
            fishType.emoji.trim() === "" ||
            typeof fishType.rarity !== "string" ||
            !Number.isSafeInteger(fishType.sellPrice) ||
            fishType.sellPrice <= 0 ||
            !Object.hasOwn(weights, fishType.rarity)
        ) {
            throw new Error("Invalid fish configuration");
        }

        itemIds.add(fishType.itemId);
    }

    const weightValues = Object.values(weights);
    if (
        weightValues.length === 0 ||
        weightValues.some((weight) => typeof weight !== "number" || !Number.isFinite(weight) || weight <= 0)
    ) {
        throw new Error("Invalid fish rarity weights");
    }

    const totalWeight = weightValues.reduce((total, weight) => total + weight, 0);
    if (!Number.isFinite(totalWeight) || Math.abs(totalWeight - 100) > 1e-9) {
        throw new Error("Fish rarity weights must total 100");
    }

    for (const rarity of Object.keys(weights)) {
        if (!fish.some((fishType) => fishType.rarity === rarity)) {
            throw new Error(`Fish configuration has no fish for rarity: ${rarity}`);
        }
    }

    return true;
}

function getFishCooldownSeconds(environment = process.env) {
    const cooldown = Number(environment.FISH_COOLDOWN ?? 60);
    if (!Number.isSafeInteger(cooldown) || cooldown <= 0) {
        throw new Error("Invalid fish cooldown configuration");
    }

    return cooldown;
}

function getFishByItemId(itemId) {
    if (typeof itemId !== "string") {
        return null;
    }

    return fishTypes.find((fish) => fish.itemId === itemId) ?? null;
}

function selectFish(random = Math.random) {
    validateFishConfiguration();
    if (typeof random !== "function") {
        throw new Error("Invalid random source");
    }

    const randomValue = random();
    if (typeof randomValue !== "number" || !Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
        throw new Error("Random source must return a number from 0 inclusive to 1 exclusive");
    }

    const totalWeight = Object.values(rarityWeights).reduce((total, weight) => total + weight, 0);
    const targetWeight = randomValue * totalWeight;
    let accumulatedWeight = 0;
    let selectedRarity;

    for (const [rarity, weight] of Object.entries(rarityWeights)) {
        accumulatedWeight += weight;
        if (targetWeight < accumulatedWeight) {
            selectedRarity = rarity;
            break;
        }
    }

    const availableFish = fishTypes.filter((fishType) => fishType.rarity === selectedRarity);
    const fishRandomValue = random();
    if (
        typeof fishRandomValue !== "number" ||
        !Number.isFinite(fishRandomValue) ||
        fishRandomValue < 0 ||
        fishRandomValue >= 1
    ) {
        throw new Error("Random source must return a number from 0 inclusive to 1 exclusive");
    }

    return availableFish[Math.floor(fishRandomValue * availableFish.length)];
}

validateFishConfiguration();

module.exports = {
    fishTypes,
    rarityWeights,
    validateFishConfiguration,
    getFishCooldownSeconds,
    getFishByItemId,
    selectFish
};
