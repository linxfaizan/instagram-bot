const { randomInt } = require("node:crypto");
const mongoose = require("mongoose");
const User = require("../models/User");
const jobs = require("../config/jobs");
const { getOrCreateUser } = require("../services/userService");
const { addCoins } = require("../services/economyService");
const { addUserXp, addWorkXp } = require("../services/levelService");
const { WORK_START_XP, WORK_COMPLETE_XP, WORK_XP_PER_COMPLETION } = require("../config/xp");
const { markCommandNotAccepted } = require("../services/rateLimitService");

const WORK_DURATION_MS = 60 * 60 * 1000;

function careerMenu() {
    const options = jobs.map((job, index) => `${index + 1}. ${job.emoji} ${job.name}`);
    return `💼 Choose Your Work\n\nChoose a career to start earning coins:\n\n${options.join("\n")}\n\nReply with the number of your choice.`;
}

function formatRemainingTime(milliseconds) {
    const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
    if (totalSeconds < 60) {
        return `${totalSeconds}s`;
    }

    const totalMinutes = Math.floor(totalSeconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0 ? `${hours}h ${minutes}m` : `${totalMinutes}m`;
}

function getJob(jobId) {
    return jobs.find((job) => job.id === jobId);
}

async function handleCareerSelection(message) {
    if (
        !message ||
        typeof message.userId !== "string" ||
        message.userId.trim() === "" ||
        typeof message.text !== "string"
    ) {
        return null;
    }

    const userId = message.userId.trim();
    const user = await User.findOne({ instagramId: userId })
        .select("job jobSelectionPending")
        .lean();

    if (!user?.jobSelectionPending || user.job) {
        return null;
    }

    const choice = message.text.trim();
    const selectedJob = /^\d+$/.test(choice) ? jobs[Number(choice) - 1] : null;
    if (!selectedJob) {
        return {
            type: "text",
            text: `❌ Choose a number from 1 to ${jobs.length}.\n\n${careerMenu()}`
        };
    }

    const updatedUser = await User.findOneAndUpdate(
        {
            instagramId: userId,
            job: null,
            jobSelectionPending: true
        },
        {
            $set: { job: selectedJob.id, jobSelectionPending: false }
        },
        { returnDocument: "after" }
    );

    if (!updatedUser) {
        return {
            type: "text",
            text: "A career has already been selected. Use /work to start your shift."
        };
    }

    return {
        type: "text",
        text: `🎉 Career Selected!\n\n${selectedJob.emoji} ${selectedJob.name}\n\nUse /work to start working.`
    };
}

async function workCommand({ message }) {
    const instagramId = message.userId.trim();
    let user = await getOrCreateUser(instagramId, message.username);

    if (!user.job) {
        await User.updateOne(
            { instagramId, job: null },
            { $set: { jobSelectionPending: true } }
        );

        return { type: "text", text: careerMenu() };
    }

    const job = getJob(user.job);
    if (!job) {
        return {
            type: "text",
            text: "❌ Your saved career is unavailable. Please contact support."
        };
    }

    const now = new Date(Date.now());

    if (!user.workStartedAt) {
        const session = await mongoose.startSession();
        let startedUser;

        try {
            startedUser = await session.withTransaction(async () => {
                const updatedUser = await User.findOneAndUpdate(
                    {
                        instagramId,
                        job: job.id,
                        $or: [
                            { workStartedAt: null },
                            { workStartedAt: { $exists: false } }
                        ]
                    },
                    { $set: { workStartedAt: now } },
                    { returnDocument: "after", session }
                );

                if (updatedUser) {
                    await addUserXp(instagramId, WORK_START_XP, session);
                }

                return updatedUser;
            });
        } finally {
            await session.endSession();
        }

        if (!startedUser) {
            user = await User.findOne({ instagramId });
            if (!user?.workStartedAt) {
                return markCommandNotAccepted({
                    type: "text",
                    text: "❌ Could not start your shift. Please try /work again."
                });
            }
        } else {
            return {
                type: "text",
                text: `${job.emoji} Work Started!\n\nYou started working as a ${job.name}.\n\n⏱️ Duration: 1 hour\n💰 Possible reward: ${job.minReward}–${job.maxReward} coins\n\nCome back after 1 hour and use /work to claim your earnings.`
            };
        }
    }

    const startedAt = user.workStartedAt;
    const claimableAt = startedAt.getTime() + WORK_DURATION_MS;
    const remainingMilliseconds = claimableAt - Date.now();

    if (remainingMilliseconds > 0) {
        return markCommandNotAccepted({
            type: "text",
            text: `⏳ You're still working!\n\n${job.emoji} Job: ${job.name}\n\n⏱️ Time remaining: ${formatRemainingTime(remainingMilliseconds)}\n\nYou can claim your earnings when the work is complete.`
        });
    }

    const reward = randomInt(job.minReward, job.maxReward + 1);
    const session = await mongoose.startSession();
    let claimResult;

    try {
        claimResult = await session.withTransaction(async () => {
            const claimedUser = await User.findOneAndUpdate(
                {
                    instagramId,
                    job: job.id,
                    workStartedAt: {
                        $eq: startedAt,
                        $lte: new Date(Date.now() - WORK_DURATION_MS)
                    }
                },
                { $set: { workStartedAt: null } },
                { returnDocument: "after", session }
            );

            if (!claimedUser) {
                return { claimed: false };
            }

            const updatedUser = await addCoins(
                instagramId,
                reward,
                "work",
                message.messageId ? { messageId: message.messageId, job: job.id } : { job: job.id },
                session
            );
            await addUserXp(instagramId, WORK_COMPLETE_XP, session);
            await addWorkXp(instagramId, WORK_XP_PER_COMPLETION, session);

            return { claimed: true, balance: updatedUser.coins };
        });
    } finally {
        await session.endSession();
    }

    if (!claimResult.claimed) {
        return markCommandNotAccepted({
            type: "text",
            text: "⏳ This shift was already claimed. Use /work to start your next shift."
        });
    }

    return {
        type: "text",
        text: `🎉 Work Complete!\n\n${job.emoji} ${job.name}\n\nYou earned ${reward} coins! 💰\n\nYour balance: ${claimResult.balance} coins.\n\nUse /work to start your next shift.`
    };
}

module.exports = workCommand;
module.exports.handleCareerSelection = handleCareerSelection;