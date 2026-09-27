const { getCommand } = require("../commands");
const workCommand = require("../commands/work");
const { parseCommand } = require("../parser/commandParser");
const defaultRateLimitService = require("../services/rateLimitService");
const { isCommandNotAccepted } = require("../services/rateLimitService");

async function handleMessage(message, options = {}) {
    if (
        !message ||
        typeof message !== "object" ||
        Array.isArray(message) ||
        typeof message.userId !== "string" ||
        message.userId.trim() === "" ||
        typeof message.text !== "string"
    ) {
        return {
            type: "text",
            text: "❌ Invalid message."
        };
    }

    const parsed = parseCommand(message.text);
    if (!parsed) {
        try {
            return await workCommand.handleCareerSelection(message);
        } catch {
            return {
                type: "text",
                text: "❌ Something went wrong. Please try again."
            };
        }
    }

    const command = getCommand(parsed.command);
    if (!command) {
        return {
            type: "text",
            text: "❌ Unknown command. Try /balance."
        };
    }

    const rateLimitService = options.rateLimitService ?? defaultRateLimitService;
    const admission = rateLimitService.beginCommand(message.userId, parsed.command);
    if (!admission.allowed) {
        const seconds = Math.ceil(admission.retryAfterMs / 1000);
        return {
            type: "text",
            text: `⏳ Slow down! Try again in ${seconds}s.`
        };
    }

    let response;
    let accepted = true;
    try {
        response = await command({
            message: { ...message, userId: message.userId.trim() },
            command: parsed.command,
            args: parsed.args
        });
    } catch {
        accepted = false;
        response = {
            type: "text",
            text: "❌ Something went wrong. Please try again."
        };
    }

    if (isCommandNotAccepted(response)) {
        accepted = false;
    }
    rateLimitService.finishCommand(admission.ticket, accepted);
    return response;
}

module.exports = { handleMessage };