const {
    findUserByUsername,
    normalizeUsername
} = require("../services/userService");

const {
    getOwnedMarriageRings,
    createProposal
} = require("../services/marriageService");

const {
    getShopItemById
} = require("../config/shop");

function formatRingList(rings) {
    return rings
        .map(
            (ring, index) =>
                `${index + 1}. ${ring.emoji} ${ring.name}`
        )
        .join("\n");
}

function proposalMessage(
    proposerUsername,
    ring
) {
    return [
        "💍 MARRIAGE PROPOSAL!",
        "",
        `@${proposerUsername} wants to marry you!`,
        "",
        `💍 Ring: ${ring.emoji} ${ring.name}`,
        "",
        "Use /accept to accept.",
        "Use /reject to reject."
    ].join("\n");
}

async function marryCommand({ message, args }) {
    const proposerId = message.userId.trim();

    const commandArgs = Array.isArray(args)
        ? args
        : [];

    if (
        commandArgs.length < 1 ||
        commandArgs.length > 2
    ) {
        return {
            type: "text",
            text:
                "💍 Marriage\n\n" +
                "Usage:\n" +
                "/marry @username\n" +
                "/marry @username <ring number>"
        };
    }

    const targetUsername =
        normalizeUsername(commandArgs[0]);

    if (!targetUsername) {
        return {
            type: "text",
            text: "❌ Please provide a valid @username."
        };
    }

    const target = await findUserByUsername(
        targetUsername,
        "instagramId username inventory"
    );

    if (!target) {
        return {
            type: "text",
            text:
                `❌ I couldn't find @${targetUsername}.\n\n` +
                "They need to interact with Eco-Bot first."
        };
    }

    if (target.instagramId === proposerId) {
        return {
            type: "text",
            text: "❌ You can't marry yourself. 😭"
        };
    }

    const proposer = await require("../models/User")
        .findOne({
            instagramId: proposerId
        })
        .select("username inventory")
        .lean();

    if (!proposer) {
        return {
            type: "text",
            text: "❌ Your Eco-Bot account could not be found."
        };
    }

    const rings = getOwnedMarriageRings(proposer);

    if (rings.length === 0) {
        return {
            type: "text",
            text:
                "❌ You don't own a marriage ring.\n\n" +
                "Buy one from /shop first."
        };
    }

    let selectedRing;

    if (commandArgs.length === 1) {
        if (rings.length === 1) {
            selectedRing = rings[0];
        } else {
            return {
                type: "text",
                text: [
                    "💍 CHOOSE YOUR RING",
                    "",
                    "Which ring would you like to use?",
                    "",
                    formatRingList(rings),
                    "",
                    `Use:`,
                    `/marry @${targetUsername} <number>`
                ].join("\n")
            };
        }
    } else {
        const ringNumber = Number(commandArgs[1]);

        if (
            !Number.isSafeInteger(ringNumber) ||
            ringNumber < 1 ||
            ringNumber > rings.length
        ) {
            return {
                type: "text",
                text:
                    `❌ Choose a ring number from 1 to ${rings.length}.`
            };
        }

        selectedRing = rings[ringNumber - 1];
    }

    const result = await createProposal(
        proposerId,
        target.instagramId,
        selectedRing.itemId
    );

    if (result.status === "target_married") {
        return {
            type: "text",
            text:
                `❌ Marriage Failed\n\n` +
                `@${targetUsername} is already married.\n\n` +
                "Your ring was not used."
        };
    }

    if (result.status === "proposer_married") {
        return {
            type: "text",
            text:
                "❌ You are already married."
        };
    }

    if (result.status === "proposal_exists") {
        return {
            type: "text",
            text:
                "❌ You already have a pending marriage proposal."
        };
    }

    if (result.status === "target_has_proposal") {
        return {
            type: "text",
            text:
                `❌ @${targetUsername} already has a pending proposal.`
        };
    }

    if (result.status === "ring_missing") {
        return {
            type: "text",
            text:
                `❌ You no longer have the selected ${selectedRing.name}.`
        };
    }

    if (result.status !== "created") {
        return {
            type: "text",
            text:
                "❌ Something went wrong while creating the proposal."
        };
    }

    const proposerUsername =
        normalizeUsername(proposer.username) ||
        "someone";

    return {
        type: "text",
        text: [
            "💍 MARRIAGE PROPOSAL SENT!",
            "",
            `You proposed to @${targetUsername}.`,
            "",
            `💍 Ring: ${selectedRing.emoji} ${selectedRing.name}`,
            "",
            "⏳ Waiting for their response...",
            "",
            "The proposal expires in 24 hours."
        ].join("\n"),

        // The webhook/dispatcher should use this to
        // send the actual proposal DM.
        sendToUser: {
            instagramId: target.instagramId,
            text: proposalMessage(
                proposerUsername,
                selectedRing
            )
        }
    };
}

module.exports = marryCommand;