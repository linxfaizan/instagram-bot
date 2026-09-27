const { randomInt } = require("node:crypto");
const mongoose = require("mongoose");
const User = require("../models/User");
const jobs = require("../config/jobs");

const { getOrCreateUser } = require("../services/userService");
const { addCoins } = require("../services/economyService");
const { addUserXp, addWorkXp } = require("../services/levelService");

const {
    WORK_START_XP,
    WORK_COMPLETE_XP,
    WORK_XP_PER_COMPLETION
} = require("../config/xp");

const {
    markCommandNotAccepted
} = require("../services/rateLimitService");

const WORK_DURATION_MS = 60 * 60 * 1000;

/**
 * UI HELPERS
 */

function careerMenu() {
    const options = jobs
        .map(
            (job, index) =>
                `${index + 1}. ${job.emoji} ${job.name}`
        )
        .join("\n");

    return `💼 ECO WORK

Choose your career to start earning coins.

🧑‍💼 CAREERS
${options}

💡 Reply with the number of your choice.`;
}

function careerSelectionError() {
    return `❌ Invalid Career

Please choose a number from 1 to ${jobs.length}.

${careerMenu()}`;
}

function careerSelectedUI(job) {
    return `🎉 CAREER SELECTED

${job.emoji} ${job.name}

💼 Your Career
Career: ${job.name}
💰 Reward: ${job.minReward}–${job.maxReward} coins
⏱️ Shift Duration: 1 hour

🚀 Use /work to start your first shift!`;
}

function workStartedUI(job) {
    return `🛠️ SHIFT STARTED

${job.emoji} ${job.name}

💼 Current Shift
Job: ${job.name}
⏱️ Duration: 1 hour
💰 Possible Reward: ${job.minReward}–${job.maxReward} coins

⏳ Your shift is now active.

💡 Come back after 1 hour
and use /work to claim your earnings.`;
}

function workInProgressUI(job, remainingMilliseconds) {
    return `⏳ WORKING...

${job.emoji} ${job.name}

💼 Current Shift
Job: ${job.name}
⏱️ Time Remaining: ${formatRemainingTime(
        remainingMilliseconds
    )}
💰 Reward: ${job.minReward}–${job.maxReward} coins

🔒 Your shift is still active.

Come back when the timer reaches 0
to claim your earnings.`;
}

function workCompleteUI(job, reward, balance) {
    return `🎉 WORK COMPLETE!

${job.emoji} ${job.name}

💰 Earnings
🪙 Shift Reward: +${formatNumber(reward)} coins
💳 New Balance: ${formatNumber(balance)} coins

✨ XP earned!
📈 Your work progress has increased.

🚀 Use /work to start your next shift.`;
}

function formatNumber(number) {
    return Number(number || 0).toLocaleString("en-US");
}

function formatRemainingTime(milliseconds) {
    const totalSeconds = Math.max(
        0,
        Math.ceil(milliseconds / 1000)
    );

    if (totalSeconds < 60) {
        return `${totalSeconds}s`;
    }

    const totalMinutes = Math.floor(totalSeconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return hours > 0
        ? `${hours}h ${minutes}m`
        : `${totalMinutes}m`;
}

function getJob(jobId) {
    return jobs.find((job) => job.id === jobId);
}

/**
 * CAREER SELECTION
 */

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

    const user = await User.findOne({
        instagramId: userId
    })
        .select("job jobSelectionPending")
        .lean();

    if (!user?.jobSelectionPending || user.job) {
        return null;
    }

    const choice = message.text.trim();

    const selectedJob =
        /^\d+$/.test(choice)
            ? jobs[Number(choice) - 1]
            : null;

    if (!selectedJob) {
        return {
            type: "text",
            text: careerSelectionError()
        };
    }

    const updatedUser =
        await User.findOneAndUpdate(
            {
                instagramId: userId,
                job: null,
                jobSelectionPending: true
            },
            {
                $set: {
                    job: selectedJob.id,
                    jobSelectionPending: false
                }
            },
            {
                returnDocument: "after"
            }
        );

    if (!updatedUser) {
        return {
            type: "text",
            text:
                "❌ A career has already been selected.\n\n" +
                "Use /work to start your shift."
        };
    }

    return {
        type: "text",
        text: careerSelectedUI(selectedJob)
    };
}

/**
 * WORK COMMAND
 */

async function workCommand({ message }) {
    const instagramId = message.userId.trim();

    let user = await getOrCreateUser(
        instagramId,
        message.username
    );

    /**
     * No career selected
     */

    if (!user.job) {
        await User.updateOne(
            {
                instagramId,
                job: null
            },
            {
                $set: {
                    jobSelectionPending: true
                }
            }
        );

        return {
            type: "text",
            text: careerMenu()
        };
    }

    const job = getJob(user.job);

    /**
     * Saved career no longer exists
     */

    if (!job) {
        return {
            type: "text",
            text:
                "❌ Your saved career is unavailable.\n\n" +
                "Please contact support."
        };
    }

    const now = new Date(Date.now());

    /**
     * START SHIFT
     */

    if (!user.workStartedAt) {
        const session = await mongoose.startSession();

        let startedUser;

        try {
            startedUser =
                await session.withTransaction(
                    async () => {
                        const updatedUser =
                            await User.findOneAndUpdate(
                                {
                                    instagramId,
                                    job: job.id,
                                    $or: [
                                        {
                                            workStartedAt: null
                                        },
                                        {
                                            workStartedAt: {
                                                $exists: false
                                            }
                                        }
                                    ]
                                },
                                {
                                    $set: {
                                        workStartedAt: now
                                    }
                                },
                                {
                                    returnDocument: "after",
                                    session
                                }
                            );

                        if (updatedUser) {
                            await addUserXp(
                                instagramId,
                                WORK_START_XP,
                                session
                            );
                        }

                        return updatedUser;
                    }
                );
        } finally {
            await session.endSession();
        }

        /**
         * Another request started the shift
         */

        if (!startedUser) {
            user = await User.findOne({
                instagramId
            });

            if (!user?.workStartedAt) {
                return markCommandNotAccepted({
                    type: "text",
                    text:
                        "❌ Could not start your shift.\n\n" +
                        "Please try /work again."
                });
            }
        } else {
            return {
                type: "text",
                text: workStartedUI(job)
            };
        }
    }

    /**
     * CHECK SHIFT TIMER
     */

    const startedAt = user.workStartedAt;

    const claimableAt =
        startedAt.getTime() + WORK_DURATION_MS;

    const remainingMilliseconds =
        claimableAt - Date.now();

    /**
     * Still working
     */

    if (remainingMilliseconds > 0) {
        return markCommandNotAccepted({
            type: "text",
            text: workInProgressUI(
                job,
                remainingMilliseconds
            )
        });
    }

    /**
     * CLAIM REWARD
     */

    const reward = randomInt(
        job.minReward,
        job.maxReward + 1
    );

    const session = await mongoose.startSession();

    let claimResult;

    try {
        claimResult =
            await session.withTransaction(
                async () => {
                    const claimedUser =
                        await User.findOneAndUpdate(
                            {
                                instagramId,
                                job: job.id,
                                workStartedAt: {
                                    $eq: startedAt,
                                    $lte: new Date(
                                        Date.now() -
                                            WORK_DURATION_MS
                                    )
                                }
                            },
                            {
                                $set: {
                                    workStartedAt: null
                                }
                            },
                            {
                                returnDocument: "after",
                                session
                            }
                        );

                    /**
                     * Prevent double claiming
                     */

                    if (!claimedUser) {
                        return {
                            claimed: false
                        };
                    }

                    const updatedUser =
                        await addCoins(
                            instagramId,
                            reward,
                            "work",
                            message.messageId
                                ? {
                                      messageId:
                                          message.messageId,
                                      job: job.id
                                  }
                                : {
                                      job: job.id
                                  },
                            session
                        );

                    await addUserXp(
                        instagramId,
                        WORK_COMPLETE_XP,
                        session
                    );

                    await addWorkXp(
                        instagramId,
                        WORK_XP_PER_COMPLETION,
                        session
                    );

                    return {
                        claimed: true,
                        balance: updatedUser.coins
                    };
                }
            );
    } finally {
        await session.endSession();
    }

    /**
     * Already claimed
     */

    if (!claimResult.claimed) {
        return markCommandNotAccepted({
            type: "text",
            text:
                "⏳ This shift was already claimed.\n\n" +
                "Use /work to start your next shift."
        });
    }

    /**
     * WORK COMPLETE
     */

    return {
        type: "text",
        text: workCompleteUI(
            job,
            reward,
            claimResult.balance
        )
    };
}

module.exports = workCommand;

module.exports.handleCareerSelection =
    handleCareerSelection;