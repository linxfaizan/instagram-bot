const {
    getOrCreateUser,
    findUserByUsername,
    normalizeUsername
} = require("../services/userService");

const { getLevelProgress } = require("../services/levelService");

/**
 * Format numbers with commas
 * Example: 10000 -> 10,000
 */
function formatNumber(number) {
    return Number(number || 0).toLocaleString("en-US");
}

/**
 * Create an XP progress bar
 */
function progressBar(current, required, size = 15) {
    if (!required || required <= 0) {
        return "█".repeat(size);
    }

    const progress = Math.min(
        Math.max(current / required, 0),
        1
    );

    const filled = Math.round(progress * size);

    return (
        "█".repeat(filled) +
        "░".repeat(size - filled)
    );
}

/**
 * Format the complete level UI
 */
function formatProgress(title, username, levelProgress) {
    const general = levelProgress.general;
    const work = levelProgress.work;

    const generalBar = progressBar(
        general.xp,
        general.requiredXp
    );

    const workBar = progressBar(
        work.xp,
        work.requiredXp
    );

    return `╭──────────────────────────╮
│       ⭐ ECO PROFILE      │
╰──────────────────────────╯

${title}

        👤 @${username}

┌─ ✨ GENERAL ──────────────┐
│                           │
│  LEVEL        ${String(general.level).padEnd(10)}│
│                           │
│  ${generalBar}       │
│  ${formatNumber(general.xp)} / ${formatNumber(general.requiredXp)} XP
│                           │
│  🚀 ${formatNumber(general.xpToNextLevel)} XP to Level ${general.level + 1}
│                           │
└───────────────────────────┘

┌─ 💼 WORK ────────────────┐
│                           │
│  LEVEL        ${String(work.level).padEnd(10)}│
│                           │
│  ${workBar}       │
│  ${formatNumber(work.xp)} / ${formatNumber(work.requiredXp)} XP
│                           │
│  🚀 ${formatNumber(work.xpToNextLevel)} XP to Level ${work.level + 1}
│                           │
└───────────────────────────┘

╭──────────────────────────╮
│ 💡 Keep earning XP!      │
│ 📈 Level up & unlock     │
│    more Eco features.    │
╰──────────────────────────╯`;
}

/**
 * Build level progress data
 */
function makeLevelProgress(user) {
    return {
        general: getLevelProgress(
            user.level,
            user.xp
        ),

        work: getLevelProgress(
            user.workLevel,
            user.workXp
        )
    };
}

/**
 * /level
 * /level @username
 */
async function levelCommand({ message, args }) {
    // Validate arguments
    if (!Array.isArray(args) || args.length > 1) {
        return {
            type: "text",
            text: "❌ Usage: /level or /level @username"
        };
    }

    let user;
    let title;

    /**
     * View another user's level
     */
    if (args.length === 1) {
        const username = normalizeUsername(args[0]);

        // Validate username
        if (
            !username ||
            !/^[a-z0-9._]+$/.test(username)
        ) {
            return {
                type: "text",
                text: "❌ Usage: /level @username"
            };
        }

        // Find user
        user = await findUserByUsername(username);

        // User doesn't exist
        if (!user) {
            return {
                type: "text",
                text:
                    `❌ User Not Found\n\n` +
                    `I couldn't find @${username}.`
            };
        }

        title = `⭐ @${username}'s Level`;
    }

    /**
     * View own level
     */
    else {
        user = await getOrCreateUser(
            message.userId,
            message.username
        );

        const username =
            normalizeUsername(user.username) ||
            "user";

        title = "⭐ Your Level";
    }

    // Normalize username
    const username =
        normalizeUsername(user.username) ||
        "user";

    // Calculate progress
    const progress = makeLevelProgress(user);

    // Return UI
    return {
        type: "text",
        text: formatProgress(
            title,
            username,
            progress
        )
    };
}

module.exports = levelCommand;