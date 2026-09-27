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
    mine: mineCommand
};

function getCommand(commandName) {
    if (typeof commandName !== "string") {
        return null;
    }

    return commands[commandName.toLowerCase()] ?? null;
}

module.exports = { getCommand };
