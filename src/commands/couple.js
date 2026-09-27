const {
    getActiveMarriage,
    getPartnerId
} = require("../services/marriageService");

const {
    findUserByInstagramId,
    normalizeUsername
} = require("../services/userService");

async function coupleCommand({ message, args }) {
    if (Array.isArray(args) && args.length > 0) {
        return {
            type: "text",
            text: "❌ Usage: /couple"
        };
    }

    const userId = message.userId.trim();

    const marriage = await getActiveMarriage(userId);

    if (!marriage) {
        return {
            type: "text",
            text:
                "💔 You're currently single.\n\n" +
                "Use /marry @username to propose."
        };
    }

    const partnerId = getPartnerId(
        marriage,
        userId
    );

    const partner =
        await findUserByInstagramId(
            partnerId,
            "username instagramId"
        );

    const partnerUsername =
        normalizeUsername(partner?.username) ||
        "unknown";

    return {
        type: "text",
        text: [
            "💑 YOUR COUPLE",
            "",
            `❤️ Partner: @${partnerUsername}`,
            `💍 Ring: ${marriage.ringItemId}`,
            `📅 Married: ${marriage.marriedAt.toLocaleDateString("en-US")}`,
            "",
            "💖 Still together!"
        ].join("\n")
    };
}

module.exports = coupleCommand;