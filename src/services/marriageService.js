const mongoose = require("mongoose");

const Marriage = require("../models/Marriage");
const MarriageProposal = require("../models/MarriageProposal");
const User = require("../models/User");

const {
    removeInventoryItem
} = require("./userService");

const {
    getShopItemById,
    getMarriageRingItems
} = require("../config/shop");

const {
    MARRIAGE_PROPOSAL_TTL_MS,
    DIVORCE_CONFIRM_TTL_MS
} = require("../config/marriage");

function normalizePair(user1Id, user2Id) {
    return user1Id < user2Id
        ? [user1Id, user2Id]
        : [user2Id, user1Id];
}

async function getActiveMarriage(instagramId) {
    if (
        typeof instagramId !== "string" ||
        instagramId.trim() === ""
    ) {
        return null;
    }

    return Marriage.findOne({
        status: "married",
        $or: [
            { user1Id: instagramId.trim() },
            { user2Id: instagramId.trim() }
        ]
    }).lean();
}

async function getPendingOutgoingProposal(proposerId) {
    return MarriageProposal.findOne({
        proposerId: proposerId.trim(),
        status: "pending",
        expiresAt: { $gt: new Date() }
    }).lean();
}

async function getPendingIncomingProposal(targetId) {
    return MarriageProposal.findOne({
        targetId: targetId.trim(),
        status: "pending",
        expiresAt: { $gt: new Date() }
    }).lean();
}

function getPartnerId(marriage, instagramId) {
    if (marriage.user1Id === instagramId) {
        return marriage.user2Id;
    }

    if (marriage.user2Id === instagramId) {
        return marriage.user1Id;
    }

    return null;
}

function getOwnedMarriageRings(user) {
    const allowedIds = new Set(
        getMarriageRingItems().map((item) => item.itemId)
    );

    const inventory = Array.isArray(user.inventory)
        ? user.inventory
        : [];

    const owned = [];

    for (const entry of inventory) {
        if (
            !entry ||
            typeof entry !== "object" ||
            !allowedIds.has(entry.itemId) ||
            !Number.isSafeInteger(entry.quantity) ||
            entry.quantity <= 0
        ) {
            continue;
        }

        const item = getShopItemById(entry.itemId);

        if (item) {
            owned.push({
                ...item,
                quantity: entry.quantity
            });
        }
    }

    return owned;
}

async function createProposal(
    proposerId,
    targetId,
    ringItemId
) {
    const proposer = proposerId.trim();
    const target = targetId.trim();

    if (proposer === target) {
        return {
            status: "self"
        };
    }

    const session = await mongoose.startSession();

    try {
        return await session.withTransaction(async () => {
            const proposerUser = await User.findOne({
                instagramId: proposer
            }).session(session);

            const targetUser = await User.findOne({
                instagramId: target
            }).session(session);

            if (!proposerUser || !targetUser) {
                return {
                    status: "user_not_found"
                };
            }

            const existingMarriage = await Marriage.findOne({
                status: "married",
                $or: [
                    {
                        user1Id: proposer,
                        user2Id: target
                    },
                    {
                        user1Id: target,
                        user2Id: proposer
                    },
                    {
                        user1Id: proposer
                    },
                    {
                        user2Id: proposer
                    },
                    {
                        user1Id: target
                    },
                    {
                        user2Id: target
                    }
                ]
            }).session(session);

            if (existingMarriage) {
                if (
                    existingMarriage.user1Id === target ||
                    existingMarriage.user2Id === target
                ) {
                    return {
                        status: "target_married"
                    };
                }

                return {
                    status: "proposer_married"
                };
            }

            const ring = getShopItemById(ringItemId);

            if (!ring) {
                return {
                    status: "invalid_ring"
                };
            }

            const ownedRing = proposerUser.inventory?.find(
                (item) =>
                    item &&
                    item.itemId === ringItemId &&
                    Number.isSafeInteger(item.quantity) &&
                    item.quantity > 0
            );

            if (!ownedRing) {
                return {
                    status: "ring_missing"
                };
            }

            const existingOutgoing =
                await MarriageProposal.findOne({
                    proposerId: proposer,
                    status: "pending",
                    expiresAt: { $gt: new Date() }
                }).session(session);

            if (existingOutgoing) {
                return {
                    status: "proposal_exists"
                };
            }

            const existingIncoming =
                await MarriageProposal.findOne({
                    targetId: target,
                    status: "pending",
                    expiresAt: { $gt: new Date() }
                }).session(session);

            if (existingIncoming) {
                return {
                    status: "target_has_proposal"
                };
            }

            const expiresAt = new Date(
                Date.now() + MARRIAGE_PROPOSAL_TTL_MS
            );

            const [proposal] =
                await MarriageProposal.create(
                    [
                        {
                            proposerId: proposer,
                            targetId: target,
                            ringItemId,
                            status: "pending",
                            expiresAt
                        }
                    ],
                    { session }
                );

            return {
                status: "created",
                proposal
            };
        });
    } catch (error) {
        if (error?.code === 11000) {
            return {
                status: "proposal_exists"
            };
        }

        throw error;
    } finally {
        await session.endSession();
    }
}

async function acceptProposal(targetId) {
    const target = targetId.trim();

    const session = await mongoose.startSession();

    try {
        return await session.withTransaction(async () => {
            const proposal =
                await MarriageProposal.findOne({
                    targetId: target,
                    status: "pending",
                    expiresAt: { $gt: new Date() }
                }).session(session);

            if (!proposal) {
                return {
                    status: "no_proposal"
                };
            }

            const proposerId = proposal.proposerId;

            const existingMarriage =
                await Marriage.findOne({
                    status: "married",
                    $or: [
                        { user1Id: proposerId },
                        { user2Id: proposerId },
                        { user1Id: target },
                        { user2Id: target }
                    ]
                }).session(session);

            if (existingMarriage) {
                return {
                    status: "already_married"
                };
            }

            // Consume exactly one selected ring.
            try {
                await removeInventoryItem(
                    proposerId,
                    proposal.ringItemId,
                    1,
                    session
                );
            } catch (error) {
                if (
                    error?.code === "ITEM_NOT_OWNED" ||
                    error?.code === "INSUFFICIENT_INVENTORY"
                ) {
                    return {
                        status: "ring_missing"
                    };
                }

                throw error;
            }

            const [user1Id, user2Id] =
                normalizePair(proposerId, target);

            const [marriage] =
                await Marriage.create(
                    [
                        {
                            user1Id,
                            user2Id,
                            ringItemId:
                                proposal.ringItemId,
                            marriedAt: new Date(),
                            status: "married"
                        }
                    ],
                    { session }
                );

            const updatedProposal =
                await MarriageProposal.findOneAndUpdate(
                    {
                        _id: proposal._id,
                        status: "pending"
                    },
                    {
                        $set: {
                            status: "accepted"
                        }
                    },
                    {
                        returnDocument: "after",
                        session,
                        runValidators: true
                    }
                );

            if (!updatedProposal) {
                throw new Error(
                    "Marriage proposal state changed"
                );
            }

            return {
                status: "accepted",
                marriage,
                proposal: updatedProposal
            };
        });
    } finally {
        await session.endSession();
    }
}

async function rejectProposal(targetId) {
    const target = targetId.trim();

    const proposal =
        await MarriageProposal.findOneAndUpdate(
            {
                targetId: target,
                status: "pending",
                expiresAt: { $gt: new Date() }
            },
            {
                $set: {
                    status: "rejected"
                }
            },
            {
                returnDocument: "after"
            }
        );

    if (!proposal) {
        return {
            status: "no_proposal"
        };
    }

    return {
        status: "rejected",
        proposal
    };
}

async function divorceMarriage(instagramId) {
    const userId = instagramId.trim();

    const marriage = await getActiveMarriage(userId);

    if (!marriage) {
        return {
            status: "not_married"
        };
    }

    return {
        status: "needs_confirmation",
        marriage,
        expiresAt: new Date(
            Date.now() + DIVORCE_CONFIRM_TTL_MS
        )
    };
}

async function confirmDivorce(instagramId) {
    const userId = instagramId.trim();

    const session = await mongoose.startSession();

    try {
        return await session.withTransaction(async () => {
            const marriage =
                await Marriage.findOneAndUpdate(
                    {
                        status: "married",
                        $or: [
                            { user1Id: userId },
                            { user2Id: userId }
                        ]
                    },
                    {
                        $set: {
                            status: "divorced",
                            divorcedAt: new Date()
                        }
                    },
                    {
                        returnDocument: "after",
                        session,
                        runValidators: true
                    }
                );

            if (!marriage) {
                return {
                    status: "not_married"
                };
            }

            return {
                status: "divorced",
                marriage
            };
        });
    } finally {
        await session.endSession();
    }
}

module.exports = {
    getActiveMarriage,
    getPartnerId,
    getOwnedMarriageRings,
    getPendingOutgoingProposal,
    getPendingIncomingProposal,
    createProposal,
    acceptProposal,
    rejectProposal,
    divorceMarriage,
    confirmDivorce
};