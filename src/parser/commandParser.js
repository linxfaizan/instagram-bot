function parseCommand(text) {
    if (typeof text !== "string") {
        return null;
    }

    const trimmedText = text.trim();
    if (!trimmedText.startsWith("/")) {
        return null;
    }

    const [rawCommand, ...args] = trimmedText.slice(1).split(/\s+/);
    if (!rawCommand) {
        return null;
    }

    return {
        command: rawCommand.toLowerCase(),
        args
    };
}

module.exports = { parseCommand };