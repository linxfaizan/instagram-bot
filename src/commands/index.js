const balanceCommand = require("./balance");
const dailyCommand = require("./daily");
const workCommand = require("./work");
const payCommand = require("./pay");
const levelCommand = require("./level");
const profileCommand = require("./profile");
const leaderboardCommand = require("./leaderboard");
const begCommand = require("./beg");
const fishCommand = require("./fish");
const inventoryCommand = require("./inventory");
const sellCommand = require("./sell");
const mineCommand = require("./mine");

// Shop
const shopCommand = require("./shop");
const buyCommand = require("./buy");

// Marriage
const marryCommand = require("./marry");
const acceptCommand = require("./accept");
const rejectCommand = require("./reject");
const divorceCommand = require("./divorce");
const coupleCommand = require("./couple");

// Coin Flip
const coinflipCommand = require("./coinflip");

// Help
const helpCommand = require("./help");

const commands = {
    balance: balanceCommand,
    daily: dailyCommand,
    work: workCommand,
    pay: payCommand,
    level: levelCommand,
    profile: profileCommand,
    leaderboard: leaderboardCommand,
    beg: begCommand,
    fish: fishCommand,
    inventory: inventoryCommand,
    sell: sellCommand,
    mine: mineCommand,

    // Shop
    shop: shopCommand,
    buy: buyCommand,

    // Marriage
    marry: marryCommand,
    accept: acceptCommand,
    reject: rejectCommand,
    divorce: divorceCommand,
    couple: coupleCommand,

    // Coin Flip
    cf: coinflipCommand,
    coinflip: coinflipCommand,

    // Help
    help: helpCommand
};

function getCommand(commandName) {
    if (typeof commandName !== "string") {
        return null;
    }

    return commands[commandName.toLowerCase()] ?? null;
}

module.exports = { getCommand };