const { getOrCreateUser } = require("../services/userService");

async function balanceCommand({ message }) {
    const user = await getOrCreateUser(message.userId, message.username);

    return {
        type: "text",
        text: `💰 Your Balance\n\nCoins: ${user.coins}\nBank: ${user.bank}\nLevel: ${user.level}\nXP: ${user.xp}`
    };
}

module.exports = balanceCommand;