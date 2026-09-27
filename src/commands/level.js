const { getOrCreateUser, findUserByUsername, normalizeUsername } = require("../services/userService");
const { getLevelProgress } = require("../services/levelService");

function formatProgress(title, username, levelProgress, xpLabel) {
    return `${title}\n\n👤 @${username}\n\nGeneral Level: ${levelProgress.general.level}\nXP: ${levelProgress.general.xp.toLocaleString("en-US")} / ${levelProgress.general.requiredXp.toLocaleString("en-US")}\n\n💼 Work Level: ${levelProgress.work.level}\nWork XP: ${levelProgress.work.xp.toLocaleString("en-US")} / ${levelProgress.work.requiredXp.toLocaleString("en-US")}\n\nNext General Level: ${levelProgress.general.xpToNextLevel.toLocaleString("en-US")} XP\nNext Work Level: ${levelProgress.work.xpToNextLevel.toLocaleString("en-US")} XP`;
}

function makeLevelProgress(user) {
    return {
        general: getLevelProgress(user.level, user.xp),
        work: getLevelProgress(user.workLevel, user.workXp)
    };
}

async function levelCommand({ message, args }) {
    if (!Array.isArray(args) || args.length > 1) {
        return {
            type: "text",
            text: "❌ Usage: /level or /level @username"
        };
    }

    let user;
    let title;
    if (args.length === 1) {
        const username = normalizeUsername(args[0]);
        if (!username || !/^[a-z0-9._]+$/.test(username)) {
            return { type: "text", text: "❌ Usage: /level @username" };
        }

        user = await findUserByUsername(username);
        if (!user) {
            return {
                type: "text",
                text: `❌ User Not Found\n\nI couldn't find @${username}.`
            };
        }
        title = `⭐ @${normalizeUsername(user.username) || username}'s Level`;
    } else {
        user = await getOrCreateUser(message.userId, message.username);
        title = "⭐ Your Level";
    }

    const username = normalizeUsername(user.username) || "user";
    const progress = makeLevelProgress(user);

    return {
        type: "text",
        text: formatProgress(title, username, progress)
    };
}

module.exports = levelCommand;