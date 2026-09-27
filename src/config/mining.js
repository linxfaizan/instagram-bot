const miningConfig = Object.freeze({
    MIN_BET: 100,
    MAX_BET: 1_000_000,
    BOARD_SIZE: 9,
    BOMBS: 3,
    SAFE_TILES: 6,
    MAX_SAFE_MINES: 3,
    MULTIPLIERS: Object.freeze({
        1: 1.35,
        2: 2.05,
        3: 3.25
    }),
    GAME_EXPIRATION_MS: null
});

function validateMiningConfiguration(config = miningConfig) {
    if (
        !config ||
        !Number.isSafeInteger(config.MIN_BET) ||
        config.MIN_BET <= 0 ||
        !Number.isSafeInteger(config.MAX_BET) ||
        config.MAX_BET < config.MIN_BET ||
        !Number.isSafeInteger(config.BOARD_SIZE) ||
        config.BOARD_SIZE < 1 ||
        !Number.isSafeInteger(config.BOMBS) ||
        config.BOMBS < 1 ||
        config.BOMBS >= config.BOARD_SIZE ||
        !Number.isSafeInteger(config.SAFE_TILES) ||
        config.SAFE_TILES !== config.BOARD_SIZE - config.BOMBS ||
        !Number.isSafeInteger(config.MAX_SAFE_MINES) ||
        config.MAX_SAFE_MINES < 1 ||
        config.MAX_SAFE_MINES > config.SAFE_TILES ||
        !config.MULTIPLIERS ||
        typeof config.MULTIPLIERS !== "object" ||
        (config.GAME_EXPIRATION_MS !== null && (
            !Number.isSafeInteger(config.GAME_EXPIRATION_MS) ||
            config.GAME_EXPIRATION_MS <= 0
        ))
    ) {
        throw new Error("Invalid mining configuration");
    }

    for (let safeMines = 1; safeMines <= config.MAX_SAFE_MINES; safeMines += 1) {
        const multiplier = config.MULTIPLIERS[safeMines];
        if (
            typeof multiplier !== "number" ||
            !Number.isFinite(multiplier) ||
            multiplier <= 1 ||
            !Number.isSafeInteger(Math.round(multiplier * 100))
        ) {
            throw new Error("Invalid mining multiplier configuration");
        }
    }

    const maximumMultiplier = config.MULTIPLIERS[config.MAX_SAFE_MINES];
    if (config.MAX_BET * maximumMultiplier > Number.MAX_SAFE_INTEGER) {
        throw new Error("Mining maximum payout is too large");
    }

    return true;
}

function getMiningMultiplier(safeMines, config = miningConfig) {
    validateMiningConfiguration(config);

    if (!Number.isSafeInteger(safeMines) || safeMines < 1 || safeMines > config.MAX_SAFE_MINES) {
        throw new Error("Invalid safe mine count");
    }

    return config.MULTIPLIERS[safeMines];
}

validateMiningConfiguration();

module.exports = {
    miningConfig,
    validateMiningConfiguration,
    getMiningMultiplier
};
