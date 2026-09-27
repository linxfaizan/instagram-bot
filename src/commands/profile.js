const {
    findUserByInstagramId,
    findUserByUsername,
    normalizeUsername
} = require("../services/userService");
const { getLevelProgress } = require("../services/levelService");
const jobs = require("../config/jobs");

function getDisplayUsername(username) {
    if (typeof username !== "string") {
        return "user";
    }

    const displayUsername = username.trim().replace(/^@/, "");
    return displayUsername || "user";
}

function formatProfile(user) {
    const username = getDisplayUsername(user.username);
    const generalProgress = getLevelProgress(user.level, user.xp);
    const workProgress = getLevelProgress(user.workLevel, user.workXp);
    const job = jobs.find((configuredJob) => configuredJob.id === user.job);
    const jobDisplay = job ? `${job.emoji} ${job.name}` : "Not selected";

    return [
        `👤 @${username}`,
        "",
        `💰 Cash: ${user.coins.toLocaleString("en-US")}`,
        "",
        `⭐ Level: ${generalProgress.level}`,
        `✨ XP: ${generalProgress.xp.toLocaleString("en-US")} / ${generalProgress.requiredXp.toLocaleString("en-US")}`,
        "",
        `💼 Job: ${jobDisplay}`,
        `📈 Work Level: ${workProgress.level}`,
        `✨ Work XP: ${workProgress.xp.toLocaleString("en-US")} / ${workProgress.requiredXp.toLocaleString("en-US")}`
    ].join("\n");
}

async function profileCommand({ message, args }) {
    if (!Array.isArray(args) || args.length > 1) {
        return {
            type: "text",
            text: "❌ Usage: /profile or /profile @username"
        };
    }

    let user;
    if (args.length === 0) {
        user = await findUserByInstagramId(message.userId);
        if (!user) {
            return {
                type: "text",
                text: "❌ Profile Not Found\n\nYour Eco-Bot profile does not exist yet."
            };
        }
    } else {
        const username = normalizeUsername(args[0]);
        if (!username || !/^[a-z0-9._]+$/.test(username)) {
            return { type: "text", text: "❌ Usage: /profile @username" };
        }

        user = await findUserByUsername(username);
        if (!user) {
            return {
                type: "text",
                text: `❌ User Not Found\n\nI couldn't find @${username}.`
            };
        }
    }

    return { type: "text", text: formatProfile(user) };
}

module.exports = profileCommand;
module.exports.formatProfile = formatProfile;
