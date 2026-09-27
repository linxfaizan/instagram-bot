const {
    getCashLeaderboard,
    getCashRankByInstagramId
} = require("../services/userService");
const { formatNumber } = require("../utils/formatNumber");

const medalsByRank = {
    1: "👑",
    2: "🥈",
    3: "🥉"
};

function getDisplayedRanks(users) {
    let previousCoins;
    let previousRank = 0;

    return users.map((user, index) => {
        const rank = index > 0 && user.coins === previousCoins ? previousRank : index + 1;
        previousCoins = user.coins;
        previousRank = rank;
        return rank;
    });
}

function getDisplayUsername(username, fallback = "unknown") {
    if (typeof username !== "string") {
        return fallback;
    }

    const displayUsername = username.trim().replace(/^@/, "");
    return displayUsername || fallback;
}

function formatLeaderboard(users, yourRank) {
    const lines = ["🏆 Eco-Bot Leaderboard", ""];

    if (users.length === 0) {
        lines.push("No users yet.");
    } else {
        const displayedRanks = getDisplayedRanks(users);
        users.forEach((user, index) => {
            const rank = displayedRanks[index];
            const medal = medalsByRank[rank];
            const username = `@${getDisplayUsername(user.username)}`;
            lines.push(
                `${rank}. ${medal ? `${medal} ` : ""}${username} — 💰 ${formatNumber(user.coins)}`
            );
        });
    }

    lines.push("");
    lines.push(`⭐ Your Rank: ${yourRank === null ? "Unranked" : `#${yourRank}`}`);
    return lines.join("\n");
}

async function leaderboardCommand({ message }) {
    const users = await getCashLeaderboard(10);
    let yourRank = null;

    if (message && typeof message.userId === "string" && message.userId.trim() !== "") {
        const currentUser = users.find((user) => user.instagramId === message.userId.trim());
        if (currentUser) {
            const index = users.indexOf(currentUser);
            yourRank = getDisplayedRanks(users)[index];
        } else {
            yourRank = await getCashRankByInstagramId(message.userId);
        }
    }

    return {
        type: "text",
        text: formatLeaderboard(users, yourRank)
    };
}

module.exports = leaderboardCommand;
module.exports.formatLeaderboard = formatLeaderboard;
module.exports.getDisplayUsername = getDisplayUsername;
