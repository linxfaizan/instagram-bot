const defaults = require("../config/rateLimit");

const NOT_ACCEPTED_SYMBOL = Symbol.for("eco-bot.commandNotAccepted");

function markCommandNotAccepted(response) {
    if (response && typeof response === "object") {
        Object.defineProperty(response, NOT_ACCEPTED_SYMBOL, {
            value: true,
            enumerable: false
        });
    }
    return response;
}

function isCommandNotAccepted(response) {
    return Boolean(response && response[NOT_ACCEPTED_SYMBOL]);
}

function createRateLimitService(options = {}) {
    const config = {
        generalCommandCooldownMs: defaults.GENERAL_COMMAND_COOLDOWN_MS,
        economyWindow10sMs: defaults.ECONOMY_WINDOW_10S_MS,
        economyMax10s: defaults.ECONOMY_MAX_10S,
        economyWindow60sMs: defaults.ECONOMY_WINDOW_60S_MS,
        economyMax60s: defaults.ECONOMY_MAX_60S,
        pendingCommandTimeoutMs: defaults.PENDING_COMMAND_TIMEOUT_MS,
        cleanupIntervalMs: defaults.CLEANUP_INTERVAL_MS,
        economyCommands: defaults.ECONOMY_COMMANDS,
        preventConcurrentCommands: true,
        autoCleanup: true,
        ...options
    };
    const users = new Map();
    let nextTicketId = 1;

    function cleanupExpiredEntries(now = Date.now()) {
        for (const [instagramId, state] of users) {
            state.economyTimestamps = state.economyTimestamps.filter(
                (timestamp) => timestamp > now - config.economyWindow60sMs
            );

            if (state.globalCooldownUntil <= now) {
                state.globalCooldownUntil = 0;
            }
            if (state.pending && state.pending.expiresAt <= now) {
                state.pending = null;
            }

            if (
                state.globalCooldownUntil === 0 &&
                state.economyTimestamps.length === 0 &&
                state.pending === null
            ) {
                users.delete(instagramId);
            }
        }
    }

    function deny(retryAfterMs, reason) {
        return {
            allowed: false,
            retryAfterMs: Math.max(1, Math.ceil(retryAfterMs)),
            reason
        };
    }

    function retryForWindow(timestamps, limit, windowMs, now) {
        if (timestamps.length < limit) {
            return 0;
        }

        const timestampToExpire = timestamps[timestamps.length - limit];
        return Math.max(0, timestampToExpire + windowMs - now);
    }

    function beginCommand(instagramId, commandName, now = Date.now()) {
        if (typeof instagramId !== "string" || instagramId.trim() === "") {
            return deny(config.generalCommandCooldownMs, "invalid_user");
        }
        if (typeof commandName !== "string" || commandName.trim() === "") {
            return deny(config.generalCommandCooldownMs, "invalid_command");
        }

        const userId = instagramId.trim();
        const command = commandName.toLowerCase();
        cleanupExpiredEntries(now);

        let state = users.get(userId);
        if (!state) {
            state = {
                globalCooldownUntil: 0,
                economyTimestamps: [],
                pending: null
            };
            users.set(userId, state);
        }

        if (state.globalCooldownUntil > now) {
            return deny(state.globalCooldownUntil - now, "global_cooldown");
        }

        if (state.pending && config.preventConcurrentCommands) {
            return deny(
                Math.min(config.generalCommandCooldownMs || 1000, state.pending.expiresAt - now),
                "command_in_progress"
            );
        }

        if (config.economyCommands.has(command)) {
            const timestamps60s = state.economyTimestamps.filter(
                (timestamp) => timestamp > now - config.economyWindow60sMs
            );
            const timestamps10s = timestamps60s.filter(
                (timestamp) => timestamp > now - config.economyWindow10sMs
            );
            const retry10s = retryForWindow(
                timestamps10s,
                config.economyMax10s,
                config.economyWindow10sMs,
                now
            );
            const retry60s = retryForWindow(
                timestamps60s,
                config.economyMax60s,
                config.economyWindow60sMs,
                now
            );

            if (retry10s > 0 || retry60s > 0) {
                if (retry10s >= retry60s) {
                    return deny(retry10s, "economy_limit_10s");
                }
                return deny(retry60s, "economy_limit_60s");
            }
        }

        const ticket = {
            userId,
            id: nextTicketId++,
            command
        };
        state.pending = {
            id: ticket.id,
            expiresAt: now + config.pendingCommandTimeoutMs
        };

        return { allowed: true, ticket };
    }

    function finishCommand(ticket, accepted = true, now = Date.now()) {
        if (!ticket || typeof ticket.userId !== "string") {
            return false;
        }

        const state = users.get(ticket.userId);
        if (!state || !state.pending || state.pending.id !== ticket.id) {
            return false;
        }

        state.pending = null;
        if (accepted) {
            state.globalCooldownUntil = now + config.generalCommandCooldownMs;
            if (config.economyCommands.has(ticket.command)) {
                state.economyTimestamps.push(now);
            }
        }

        cleanupExpiredEntries(now);
        return true;
    }

    let cleanupTimer = null;
    if (config.autoCleanup) {
        cleanupTimer = setInterval(cleanupExpiredEntries, config.cleanupIntervalMs);
        cleanupTimer.unref?.();
    }

    return {
        beginCommand,
        finishCommand,
        cleanupExpiredEntries,
        getTrackedUserCount: () => users.size,
        dispose: () => {
            if (cleanupTimer) {
                clearInterval(cleanupTimer);
                cleanupTimer = null;
            }
        }
    };
}

const defaultService = createRateLimitService();

module.exports = {
    beginCommand: (...args) => defaultService.beginCommand(...args),
    finishCommand: (...args) => defaultService.finishCommand(...args),
    cleanupExpiredEntries: (...args) => defaultService.cleanupExpiredEntries(...args),
    createRateLimitService,
    markCommandNotAccepted,
    isCommandNotAccepted,
    economyCommands: defaults.ECONOMY_COMMANDS
};
