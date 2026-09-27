const {
    acceptProposal
} = require("../services/marriageService");

const {
    findUserByInstagramId,
    normalizeUsername
} = require("../services/userService");

const {
    getShopItemById
} = require("../config/shop");

async function acceptCommand({ message, args }) {
    if (Array.isArray(args) && args.length > 0) {
        return {
            type: "text",
            text: "❌ Usage: /accept"
        };
    }

    const targetId = message.userId.trim();

    const result = await acceptProposal(targetId);

    if (result.status === "no_proposal") {
        return {
            type: "text",
            text:
                "❌ You don't have a pending marriage proposal."
        };
    }

    if (result.status === "ring_missing") {
        return {
            type: "text",
            text:
                "❌ The selected ring is no longer available.\n\n" +
                "The marriage was not completed."
        };
    }

    if (result.status === "already_married") {
        return {
            type: "text",
            text:
                "❌ One of you is already married."
        };
    }

    if (result.status !== "accepted") {
        return {
            type: "text",
            text:
                "❌ The marriage proposal could not be accepted."
        };
    }

    const proposer =
        await findUserByInstagramId(
            result.proposal.proposerId,
            "username instagramId"
        );

    const target =
        await findUserByInstagramId(
            targetId,
            "username instagramId"
        );

    const ring =
        getShopItemById(
            result.proposal.ringItemId
        );

    const proposerUsername =
        normalizeUsername(proposer?.username) ||
        "unknown";

    const targetUsername =
        normalizeUsername(target?.username) ||
        "unknown";

    return {
        type: "text",
        text: [
            "💍 MARRIAGE COMPLETE!",
            "",
            `💑 @${proposerUsername} ❤️ @${targetUsername}`,
            "",
            `💍 Ring: ${ring?.emoji || "💍"} ${ring?.name || "Ring"}`,
            "",
            "🎉 You're officially married!",
            "",
            "Use /couple to view your relationship."
        ].join("\n"),

        sendToUser: {
            instagramId: result.proposal.proposerId,
            text: [
                "💍 MARRIAGE ACCEPTED!",
                "",
                `@${targetUsername} accepted your proposal!`,
                "",
                `💍 Ring: ${ring?.emoji || "💍"} ${ring?.name || "Ring"}`,
                "",
                "🎉 You're officially married!",
                "",
                "Use /couple to view your relationship."
            ].join("\n")
        }
    };
}

module.exports = acceptCommand;