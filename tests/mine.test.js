require("dotenv").config();

const assert = require("node:assert/strict");
const { test } = require("node:test");
const mongoose = require("mongoose");
const connectDatabase = require("../src/config/database");
const User = require("../src/models/User");
const MiningGame = require("../src/models/MiningGame");
const Transaction = require("../src/models/Transaction");
const { handleMessage } = require("./handleMessage");
const {
    createMineCommand,
    createBombPositions,
    calculatePayout
} = require("../src/commands/mine");
const {
    miningConfig,
    validateMiningConfiguration,
    getMiningMultiplier
} = require("../src/config/mining");

const testRunId = `mine-test-${Date.now()}-${process.pid}`;
const testUserIds = {
    registered: `${testRunId}-registered`,
    invalid: `${testRunId}-invalid`,
    insufficient: `${testRunId}-insufficient`,
    oneSafe: `${testRunId}-one-safe`,
    twoSafe: `${testRunId}-two-safe`,
    completed: `${testRunId}-completed`,
    bomb: `${testRunId}-bomb`,
    duplicate: `${testRunId}-duplicate`,
    isolated: `${testRunId}-isolated`,
    concurrentStart: `${testRunId}-concurrent-start`,
    concurrentCashout: `${testRunId}-concurrent-cashout`
};

let messageNumber = 0;

function message(userId, text = "/mine") {
    messageNumber += 1;
    return {
        platform: "instagram",
        userId,
        username: "mine_test_user",
        messageId: `${testRunId}-message-${messageNumber}`,
        text,
        timestamp: Date.now()
    };
}

function mineArgs(...args) {
    return args;
}

function createDeterministicMineCommand() {
    return createMineCommand(() => [2, 4, 7]);
}

async function runMine(command, userId, ...args) {
    const currentMessage = message(userId, `/mine ${args.join(" ")}`.trim());
    return command({ message: currentMessage, args: mineArgs(...args) });
}

async function createUser(instagramId, coins = 10_000) {
    return User.create({
        instagramId,
        username: "mine_test_user",
        coins
    });
}

async function getActiveGame(instagramId) {
    return MiningGame.findOne({ instagramId, status: "active" });
}

test("mining configuration, board generation, and full /mine lifecycle are safe and persistent", async () => {
    const allUserIds = Object.values(testUserIds);

    try {
        assert.equal(validateMiningConfiguration(), true);
        assert.equal(getMiningMultiplier(1), 1.35);
        assert.equal(getMiningMultiplier(2), 2.05);
        assert.equal(getMiningMultiplier(3), 3.25);
        assert.equal(calculatePayout(6000, 1), 8100);
        assert.equal(calculatePayout(6000, 2), 12300);
        assert.equal(calculatePayout(6000, 3), 19500);
        assert.throws(() => getMiningMultiplier(0), /Invalid safe mine count/);

        const randomValues = [1, 1, 2, 3];
        assert.deepEqual(
            createBombPositions(() => randomValues.shift()),
            [1, 2, 3]
        );

        await connectDatabase();
        assert.equal(mongoose.connection.readyState, 1, "MongoDB should be connected");
        await MiningGame.init();

        const existingUsers = await User.find({
            instagramId: { $in: allUserIds }
        }).select("instagramId").lean();
        const existingGames = await MiningGame.find({
            instagramId: { $in: allUserIds }
        }).select("instagramId").lean();
        assert.deepEqual(existingUsers, []);
        assert.deepEqual(existingGames, []);

        const registeredResponse = await handleMessage(
            message(testUserIds.registered, "/mine 100")
        );
        assert.ok(registeredResponse.text.includes("ECO-BOT MINES"));
        const registeredGame = await getActiveGame(testUserIds.registered);
        assert.ok(registeredGame);
        assert.equal(registeredGame.bet, 100);
        assert.equal(registeredGame.bombPositions.length, miningConfig.BOMBS);
        assert.equal(new Set(registeredGame.bombPositions).size, miningConfig.BOMBS);
        assert.equal(
            Array.from({ length: miningConfig.BOARD_SIZE }, (_, index) => index + 1)
                .filter((tile) => !registeredGame.bombPositions.includes(tile)).length,
            miningConfig.SAFE_TILES
        );

        for (const [rawBet, expectedText] of [
            ["abc", "Invalid amount"],
            ["0", "Bet must be greater than 0"],
            ["-500", "Bet must be greater than 0"]
        ]) {
            const response = await handleMessage(
                message(testUserIds.invalid, `/mine ${rawBet}`)
            );
            assert.ok(response.text.includes(expectedText));
        }
        assert.equal(await MiningGame.exists({ instagramId: testUserIds.invalid }), null);

        await createUser(testUserIds.insufficient, miningConfig.MIN_BET - 1);
        const insufficientResponse = await handleMessage(
            message(testUserIds.insufficient, `/mine ${miningConfig.MIN_BET}`)
        );
        assert.ok(insufficientResponse.text.includes("don't have enough coins"));
        assert.equal(await MiningGame.exists({ instagramId: testUserIds.insufficient }), null);

        const mine = createDeterministicMineCommand();

        await createUser(testUserIds.oneSafe);
        const oneSafeStart = await runMine(mine, testUserIds.oneSafe, "6000");
        assert.ok(oneSafeStart.text.includes("ECO-BOT MINES"));
        let oneSafeGame = await getActiveGame(testUserIds.oneSafe);
        assert.deepEqual(oneSafeGame.bombPositions, [2, 4, 7]);
        assert.equal((await User.findOne({ instagramId: testUserIds.oneSafe })).coins, 4000);

        const secondGameResponse = await runMine(mine, testUserIds.oneSafe, "6000");
        assert.ok(secondGameResponse.text.includes("already have an active mining game"));
        assert.equal((await User.findOne({ instagramId: testUserIds.oneSafe })).coins, 4000);

        const prematureCashout = await runMine(mine, testUserIds.oneSafe, "out");
        assert.ok(prematureCashout.text.includes("haven't mined anything yet"));

        const oneSafeResponse = await runMine(mine, testUserIds.oneSafe, "1");
        assert.ok(oneSafeResponse.text.includes("SAFE"));
        assert.ok(oneSafeResponse.text.includes("1.35x"));
        oneSafeGame = await getActiveGame(testUserIds.oneSafe);
        assert.deepEqual(oneSafeGame.revealedTiles, [1]);
        assert.equal(oneSafeGame.safeMines, 1);
        assert.equal(oneSafeGame.currentMultiplier, 1.35);

        const duplicateTileResponse = await runMine(mine, testUserIds.oneSafe, "1");
        assert.ok(duplicateTileResponse.text.includes("already mined tile 1"));
        const invalidTileResponse = await runMine(mine, testUserIds.oneSafe, "10");
        assert.ok(invalidTileResponse.text.includes("Choose a tile from 1 to 9"));
        const invalidActiveTileResponse = await runMine(mine, testUserIds.oneSafe, "abc");
        assert.ok(invalidActiveTileResponse.text.includes("Invalid tile"));

        const oneSafeCashout = await runMine(mine, testUserIds.oneSafe, "out");
        assert.ok(oneSafeCashout.text.includes("MINING CASHOUT"));
        assert.ok(oneSafeCashout.text.includes("Payout: 8,100"));
        let oneSafeUser = await User.findOne({ instagramId: testUserIds.oneSafe });
        assert.equal(oneSafeUser.coins, 12_100);
        assert.equal((await MiningGame.findOne({ instagramId: testUserIds.oneSafe })).status, "cashed_out");
        assert.equal(await Transaction.countDocuments({
            to: testUserIds.oneSafe,
            type: "mine_payout"
        }), 1);

        const secondCashout = await runMine(mine, testUserIds.oneSafe, "out");
        assert.ok(secondCashout.text.includes("don't have an active mining game"));
        oneSafeUser = await User.findOne({ instagramId: testUserIds.oneSafe });
        assert.equal(oneSafeUser.coins, 12_100);
        assert.equal(await Transaction.countDocuments({
            to: testUserIds.oneSafe,
            type: "mine_payout"
        }), 1);

        await createUser(testUserIds.twoSafe);
        await runMine(mine, testUserIds.twoSafe, "6000");
        await runMine(mine, testUserIds.twoSafe, "1");
        const resumedMineCommand = createDeterministicMineCommand();
        const twoSafeResponse = await runMine(resumedMineCommand, testUserIds.twoSafe, "3");
        assert.ok(twoSafeResponse.text.includes("2.05x"));
        const twoSafeCashout = await runMine(mine, testUserIds.twoSafe, "out");
        assert.ok(twoSafeCashout.text.includes("Payout: 12,300"));
        assert.equal((await User.findOne({ instagramId: testUserIds.twoSafe })).coins, 16_300);

        await createUser(testUserIds.completed);
        await runMine(mine, testUserIds.completed, "6000");
        await runMine(mine, testUserIds.completed, "1");
        await runMine(mine, testUserIds.completed, "3");
        const completedResponse = await runMine(mine, testUserIds.completed, "5");
        assert.ok(completedResponse.text.includes("3 SAFE MINES"));
        assert.ok(completedResponse.text.includes("Payout: 19,500"));
        assert.equal((await User.findOne({ instagramId: testUserIds.completed })).coins, 23_500);
        assert.equal((await MiningGame.findOne({ instagramId: testUserIds.completed })).status, "completed");
        assert.equal(await Transaction.countDocuments({
            to: testUserIds.completed,
            type: "mine_payout"
        }), 1);

        await createUser(testUserIds.bomb);
        await runMine(mine, testUserIds.bomb, "6000");
        const bombResponse = await runMine(mine, testUserIds.bomb, "2");
        assert.ok(bombResponse.text.includes("BOOM"));
        assert.ok(bombResponse.text.includes("Lost: 6,000"));
        assert.equal((await User.findOne({ instagramId: testUserIds.bomb })).coins, 4000);
        assert.equal((await MiningGame.findOne({ instagramId: testUserIds.bomb })).status, "lost");
        assert.equal(await Transaction.countDocuments({
            to: testUserIds.bomb,
            type: "mine_payout"
        }), 0);

        await createUser(testUserIds.isolated);
        await createUser(testUserIds.duplicate);
        await runMine(mine, testUserIds.isolated, "6000");
        await runMine(mine, testUserIds.duplicate, "6000");
        const isolatedGameBefore = await getActiveGame(testUserIds.isolated);
        const otherGameBefore = await getActiveGame(testUserIds.duplicate);
        await runMine(mine, testUserIds.isolated, "1");
        const activeGameDisplay = await runMine(mine, testUserIds.isolated);
        assert.ok(activeGameDisplay.text.includes("ACTIVE MINING GAME"));
        const isolatedGameAfter = await getActiveGame(testUserIds.isolated);
        const otherGameAfter = await getActiveGame(testUserIds.duplicate);
        assert.notDeepEqual(isolatedGameAfter.revealedTiles, isolatedGameBefore.revealedTiles);
        assert.deepEqual(otherGameAfter.revealedTiles, otherGameBefore.revealedTiles);
        assert.equal((await User.findOne({ instagramId: testUserIds.isolated })).coins, 4000);
        assert.equal((await User.findOne({ instagramId: testUserIds.duplicate })).coins, 4000);

        await createUser(testUserIds.concurrentStart);
        const concurrentStartResponses = await Promise.all([
            runMine(mine, testUserIds.concurrentStart, "6000"),
            runMine(mine, testUserIds.concurrentStart, "6000")
        ]);
        assert.equal(
            concurrentStartResponses.filter((response) => response.text.includes("ECO-BOT MINES")).length,
            1
        );
        assert.equal(await MiningGame.countDocuments({
            instagramId: testUserIds.concurrentStart,
            status: "active"
        }), 1);
        assert.equal((await User.findOne({ instagramId: testUserIds.concurrentStart })).coins, 4000);

        await createUser(testUserIds.concurrentCashout);
        await runMine(mine, testUserIds.concurrentCashout, "6000");
        await runMine(mine, testUserIds.concurrentCashout, "1");
        const concurrentCashoutResponses = await Promise.all([
            runMine(mine, testUserIds.concurrentCashout, "out"),
            runMine(mine, testUserIds.concurrentCashout, "out")
        ]);
        assert.equal(
            concurrentCashoutResponses.filter((response) => response.text.includes("MINING CASHOUT")).length,
            1
        );
        assert.equal((await User.findOne({ instagramId: testUserIds.concurrentCashout })).coins, 12_100);
        assert.equal(await Transaction.countDocuments({
            to: testUserIds.concurrentCashout,
            type: "mine_payout"
        }), 1);
    } finally {
        try {
            await Transaction.deleteMany({
                $or: [
                    { from: { $in: allUserIds } },
                    { to: { $in: allUserIds } }
                ]
            });
            await MiningGame.deleteMany({ instagramId: { $in: allUserIds } });
            await User.deleteMany({ instagramId: { $in: allUserIds } });
        } finally {
            if (mongoose.connection.readyState === 1) {
                await mongoose.disconnect();
            }
        }
    }
});
