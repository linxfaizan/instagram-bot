module.exports = {
    GENERAL_COMMAND_COOLDOWN_MS: 5000,
    ECONOMY_WINDOW_10S_MS: 10000,
    ECONOMY_MAX_10S: 5,
    ECONOMY_WINDOW_60S_MS: 60000,
    ECONOMY_MAX_60S: 20,
    PENDING_COMMAND_TIMEOUT_MS: 30000,
    CLEANUP_INTERVAL_MS: 60000,
    ECONOMY_COMMANDS: new Set([
        "daily",
        "work",
        "pay",
        "beg",
        "fish",
        "sell",
        "buy"
    ])
};
