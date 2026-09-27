const {
    getActiveMarriage,
    getPartnerId,
    confirmDivorce
} = require("../services/marriageService");

const {
    findUserByInstagramId,
    normalizeUsername
} = require("../services/userService");

async function divorceCommand({ message, args }) {
    const commandArgs = Array.isArray(args)
        ? args
        : [];

    const userId = message.userId.trim();

    if (
        commandArgs.length === 1 &&
        commandArgs[0].toLowerCase() === "confirm"
    ) {
        const result = await confirmDivorce(userId);

        if (result.status === "not_married") {
            return {
                type: "text",
                text: "❌ You're not married."
            };
        }

        const partnerId = getPartnerId(
            result.marriage,
            userId
        );

        const partner =
            await findUserByInstagramId(
                partnerId,
                "username"
            );

        const partnerUsername =
            normalizeUsername(partner?.username) ||
            "unknown";

        return {
            type: "text",
            text: [
                "💔 DIVORCE COMPLETE",
                "",
                `You are no longer married to @${partnerUsername}.`,
                "",
                "💍 The ring was not returned."
            ].join("\n"),

            sendToUser: {
                instagramId: partnerId,
                text: [
                    "💔 DIVORCE",
                    "",
                    `@${normalizeUsername(
                        (
                            await findUserByInstagramId(
                                userId,
                                "username"
                            )
                        )?.username
                    ) || "unknown"} divorced you.`,
                    "",
                    "💍 The ring was not returned."
                ].join("\n")
            }
        };
    }

    if (commandArgs.length > 0) {
        return {
            type: "text",
            text:
                "❌ Usage:\n\n" +
                "/divorce\n" +
                "/divorce confirm"
        };
    }

    const marriage =
        await getActiveMarriage(userId);

    if (!marriage) {
        return {
            type: "text",
            text: "❌ You're not married."
        };
    }

    const partnerId = getPartnerId(
        marriage,
        userId
    );

    const partner =
        await findUserByInstagramId(
            partnerId,
            "username"
        );

    const partnerUsername =
        normalizeUsername(partner?.username) ||
        "unknown";

    return {
        type: "text",
        text: [
            "💔 DIVORCE?",
            "",
            `You are married to @${partnerUsername}.`,
            "",
            "⚠️ This action cannot be undone.",
            "💍 Your ring will NOT be returned.",
            "",
            "If you're sure, use:",
            "/divorce confirm"
        ].join("\n")
    };
}

module.exports = divorceCommand;