const { handleMessage: dispatchMessage } = require("../src/core/bot");

const unrestrictedRateLimitService = {
    beginCommand() {
        return { allowed: true, ticket: null };
    },
    finishCommand() {
        return true;
    }
};

function handleMessage(message, options = {}) {
    return dispatchMessage(message, {
        rateLimitService: unrestrictedRateLimitService,
        ...options
    });
}

module.exports = { handleMessage };
