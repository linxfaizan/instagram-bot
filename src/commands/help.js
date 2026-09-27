const { markCommandNotAccepted } = require("../services/rateLimitService");

function notAccepted(text) {
    return markCommandNotAccepted({
        type: "text",
        text
    });
}

async function helpCommand({ args }) {
    const command = Array.isArray(args)
        ? args[0]?.toLowerCase()
        : null;

    // /help <command>
    if (command) {
        const help = {
            balance: [
                "💰 /balance",
                "",
                "View your current coin balance.",
                "",
                "Usage:",
                "/balance"
            ],

            daily: [
                "🎁 /daily",
                "",
                "Claim your daily coin reward.",
                "",
                "Usage:",
                "/daily"
            ],

            work: [
                "💼 /work",
                "",
                "Work to earn coins and XP.",
                "",
                "Usage:",
                "/work"
            ],

            beg: [
                "🥺 /beg",
                "",
                "Beg for a random coin reward.",
                "",
                "Usage:",
                "/beg"
            ],

            pay: [
                "💸 /pay",
                "",
                "Send coins to another user.",
                "",
                "Usage:",
                "/pay @username <amount>",
                "",
                "Example:",
                "/pay @user 1000"
            ],

            profile: [
                "👤 /profile",
                "",
                "View your Eco-Bot profile.",
                "",
                "Usage:",
                "/profile"
            ],

            level: [
                "⭐ /level",
                "",
                "View your level and XP.",
                "",
                "Usage:",
                "/level"
            ],

            leaderboard: [
                "🏆 /leaderboard",
                "",
                "View the Eco-Bot leaderboard.",
                "",
                "Usage:",
                "/leaderboard"
            ],

            fish: [
                "🎣 /fish",
                "",
                "Go fishing and receive items.",
                "",
                "Usage:",
                "/fish"
            ],

            inventory: [
                "🎒 /inventory",
                "",
                "View your inventory.",
                "",
                "Usage:",
                "/inventory"
            ],

            sell: [
                "💰 /sell",
                "",
                "Sell an item from your inventory.",
                "",
                "Usage:",
                "/sell <item>"
            ],

            shop: [
                "🛒 /shop",
                "",
                "View the Eco-Bot shop.",
                "",
                "Usage:",
                "/shop"
            ],

            buy: [
                "🛍️ /buy",
                "",
                "Buy an item from the shop.",
                "",
                "Usage:",
                "/buy <number> [quantity]",
                "",
                "Examples:",
                "/buy 5",
                "/buy 5 2"
            ],

            mine: [
                "⛏️ /mine",
                "",
                "Play the 3×3 Mines game.",
                "",
                "Start:",
                "/mine <amount>",
                "",
                "Choose a tile:",
                "/mine <1-9>",
                "",
                "Cash out:",
                "/mine out"
            ],

            cf: [
                "🪙 /cf",
                "",
                "Play Coin Flip.",
                "",
                "Usage:",
                "/cf <amount> <h/t>",
                "",
                "Examples:",
                "/cf 1000 h",
                "/cf 1000 heads",
                "/cf 1000 t",
                "/cf 1000 tails",
                "",
                "Alias:",
                "/coinflip <amount> <heads/tails>"
            ],

            coinflip: [
                "🪙 /coinflip",
                "",
                "Play Coin Flip.",
                "",
                "Usage:",
                "/coinflip <amount> <heads/tails>",
                "",
                "Examples:",
                "/coinflip 1000 heads",
                "/coinflip 1000 tails"
            ],

            marry: [
                "💍 /marry",
                "",
                "Send a marriage proposal to another user.",
                "",
                "Usage:",
                "/marry @username",
                "",
                "If you have multiple rings:",
                "/marry @username <ring>",
                "",
                "You need a marriage ring to propose.",
                "",
                "The selected ring is only consumed when the proposal is accepted."
            ],

            accept: [
                "💍 /accept",
                "",
                "Accept a pending marriage proposal.",
                "",
                "Usage:",
                "/accept"
            ],

            reject: [
                "💔 /reject",
                "",
                "Reject a pending marriage proposal.",
                "",
                "Usage:",
                "/reject"
            ],

            divorce: [
                "💔 /divorce",
                "",
                "Start the divorce confirmation process.",
                "",
                "Usage:",
                "/divorce",
                "",
                "Then confirm with:",
                "/divorce confirm",
                "",
                "The used marriage ring is not returned."
            ],

            couple: [
                "💑 /couple",
                "",
                "View your current partner.",
                "",
                "Usage:",
                "/couple"
            ]
        };

        if (!help[command]) {
            return notAccepted(
                "❌ Unknown command.\n\nUse /help to see all available commands."
            );
        }

        return notAccepted(help[command].join("\n"));
    }

    // Main /help
    return notAccepted([
        "🤖 ECO-BOT HELP",
        "",
        "💰 Economy",
        "/balance",
        "/daily",
        "/work",
        "/beg",
        "/pay @user <amount>",
        "/profile",
        "/level",
        "/leaderboard",
        "",
        "🎣 Fishing & Inventory",
        "/fish",
        "/inventory",
        "/sell <item>",
        "",
        "🛒 Shop",
        "/shop",
        "/buy <number> [quantity]",
        "",
        "⛏️ Mines",
        "/mine <amount>",
        "/mine <1-9>",
        "/mine out",
        "",
        "🪙 Coin Flip",
        "/cf <amount> <h/t>",
        "/coinflip <amount> <heads/tails>",
        "",
        "💍 Marriage",
        "/marry @user",
        "/accept",
        "/reject",
        "/divorce",
        "/divorce confirm",
        "/couple",
        "",
        "━━━━━━━━━━━━━━",
        "",
        "💡 Use /help <command>",
        "for detailed information."
    ].join("\n"));
}

module.exports = helpCommand;