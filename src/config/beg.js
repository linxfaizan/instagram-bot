const DEFAULT_BEG_CONFIG = {
    minReward: 50,
    maxReward: 250,
    cooldownSeconds: 300
};

function readBegConfig(environment = process.env) {
    return {
        minReward: Number(environment.BEG_MIN_REWARD ?? DEFAULT_BEG_CONFIG.minReward),
        maxReward: Number(environment.BEG_MAX_REWARD ?? DEFAULT_BEG_CONFIG.maxReward),
        cooldownSeconds: Number(environment.BEG_COOLDOWN ?? DEFAULT_BEG_CONFIG.cooldownSeconds)
    };
}

function validateBegConfig(config) {
    if (
        !Number.isSafeInteger(config.minReward) ||
        config.minReward <= 0 ||
        !Number.isSafeInteger(config.maxReward) ||
        config.maxReward < config.minReward ||
        !Number.isSafeInteger(config.cooldownSeconds) ||
        config.cooldownSeconds <= 0 ||
        !Number.isFinite(config.cooldownSeconds * 1000)
    ) {
        throw new Error("Invalid beg configuration");
    }

    return config;
}

module.exports = { readBegConfig, validateBegConfig };