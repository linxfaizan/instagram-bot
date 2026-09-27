const {
    rejectProposal
} = require("../services/marriageService");

const {
    findUserByInstagramId,
    normalizeUsername
} = require("../services/userService");

async function rejectCommand({ message, args }) {
    if (Array.isArray(args) && args.length > 0) {
        return {
            type: "text",
            text: "❌ Usage: /reject"
        };
    }

    const targetId = message.userId.trim();

    const result = await rejectProposal(targetId);

    if (result.status === "no_proposal") {
        return {
            type: "text",
            text:
                "❌ You don't have a pending marriage proposal."
        };
    }

    const proposer =
        await findUserByInstagramId(
            result.proposal.proposerId,
            "username instagramId"
        );

    const proposerUsername =
        normalizeUsername(proposer?.username) ||
        "unknown";

    return {
        type: "text",
        text:
            "💍 Marriage Proposal Rejected\n\n" +
            `You rejected @${proposerUsername}'s proposal.\n\n` +
            "💍 Your ring was not used.",

        sendToUser: {
            instagramId: result.proposal.proposerId,
            text:
                "💍 Marriage Proposal Rejected\n\n" +
                `@${normalizeUsername(
                    (
                        await findUserByInstagramId(
                            targetId,
                            "username"
                        )
                    )?.username
                ) || "unknown"} rejected your proposal.\n\n" +
                "💍 Your ring was not used."
        }
    };
}

module.exports = rejectCommand;