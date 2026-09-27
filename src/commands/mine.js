const { randomInt } = require("node:crypto");
const mongoose = require("mongoose");
const User = require("../models/User");
const MiningGame = require("../models/MiningGame");
const { getOrCreateUser } = require("../services/userService");
const { addCoins, removeCoins } = require("../services/economyService");
const { markCommandNotAccepted } = require("../services/rateLimitService");
const {
    miningConfig,
    validateMiningConfiguration,
    getMiningMultiplier
} = require("../config/mining");
const { formatNumber } = require("../utils/formatNumber");

const TILE_LABELS = Object.freeze([
    "",
    "1️⃣",
    "2️⃣",
    "3️⃣",
    "4️⃣",
    "5️⃣",
    "6️⃣",
    "7️⃣",
    "8️⃣",
    "9️⃣"
]);

function notAccepted(text) {
    return markCommandNotAccepted({ type: "text", text });
}

function formatMultiplier(multiplier) {
    return `${multiplier.toFixed(2)}x`;
}

function createBombPositions(randomIntFn = randomInt) {
    validateMiningConfiguration();
    const positions = new Set();

    while (positions.size < miningConfig.BOMBS) {
        const position = randomIntFn(1, miningConfig.BOARD_SIZE + 1);
        if (!Number.isSafeInteger(position) || position < 1 || position > miningConfig.BOARD_SIZE) {
            throw new Error("Mining random source returned an invalid tile");
        }
        positions.add(position);
    }

    return [...positions].sort((left, right) => left - right);
}

function calculatePayout(bet, safeMines) {
    if (!Number.isSafeInteger(bet) || bet <= 0) {
        throw new Error("Invalid mining bet");
    }

    const multiplier = getMiningMultiplier(safeMines);
    const multiplierInHundredths = Math.round(multiplier * 100);
    const payout = BigInt(bet) * BigInt(multiplierInHundredths) / 100n;

    if (payout <= 0n || payout > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error("Mining payout is too large to process safely");
    }

    return Number(payout);
}

function parseBet(rawBet) {
    if (typeof rawBet !== "string" || !/^-?\d+$/.test(rawBet)) {
        return { error: "invalid" };
    }

    const bet = BigInt(rawBet);
    if (bet <= 0n) {
        return { error: "non_positive" };
    }
    if (bet > BigInt(Number.MAX_SAFE_INTEGER)) {
        return { error: "invalid" };
    }

    const amount = Number(bet);
    if (amount < miningConfig.MIN_BET) {
        return { error: "below_minimum" };
    }
    if (amount > miningConfig.MAX_BET) {
        return { error: "above_maximum" };
    }

    return { amount };
}

function isConfiguredBet(rawBet) {
    return Boolean(parseBet(rawBet).amount);
}

function formatActiveBoard(revealedTiles) {
    const revealed = new Set(revealedTiles);
    const tiles = Array.from(
        { length: miningConfig.BOARD_SIZE },
        (_, index) => revealed.has(index + 1) ? "✅" : TILE_LABELS[index + 1]
    );
    const rows = [];

    for (let index = 0; index < tiles.length; index += 3) {
        rows.push(tiles.slice(index, index + 3).join(" "));
    }

    return rows.join("\n");
}

function formatCompletedBoard(game) {
    const bombs = new Set(game.bombPositions);
    const tiles = Array.from(
        { length: miningConfig.BOARD_SIZE },
        (_, index) => `${TILE_LABELS[index + 1]} ${bombs.has(index + 1) ? "💣" : "💎"}`
    );
    const rows = [];

    for (let index = 0; index < tiles.length; index += 3) {
        rows.push(tiles.slice(index, index + 3).join("  "));
    }

    return rows.join("\n");
}

function validateStoredGame(game) {
    if (
        !game ||
        !Number.isSafeInteger(game.bet) ||
        game.bet < miningConfig.MIN_BET ||
        game.bet > miningConfig.MAX_BET ||
        !Array.isArray(game.bombPositions) ||
        game.bombPositions.length !== miningConfig.BOMBS ||
        new Set(game.bombPositions).size !== miningConfig.BOMBS ||
        game.bombPositions.some((position) =>
            !Number.isSafeInteger(position) ||
            position < 1 ||
            position > miningConfig.BOARD_SIZE
        ) ||
        !Array.isArray(game.revealedTiles) ||
        new Set(game.revealedTiles).size !== game.revealedTiles.length ||
        game.revealedTiles.some((position) =>
            !Number.isSafeInteger(position) ||
            position < 1 ||
            position > miningConfig.BOARD_SIZE ||
            game.bombPositions.includes(position)
        ) ||
        !Number.isSafeInteger(game.safeMines) ||
        game.safeMines !== game.revealedTiles.length ||
        game.safeMines < 0 ||
        game.safeMines > miningConfig.MAX_SAFE_MINES ||
        typeof game.currentMultiplier !== "number" ||
        !Number.isFinite(game.currentMultiplier) ||
        game.currentMultiplier !== (
            game.safeMines === 0 ? 1 : getMiningMultiplier(game.safeMines)
        )
    ) {
        throw new Error("Invalid mining game state");
    }
}

function formatStart(game) {
    return {
        type: "text",
        text: [
            "⛏️ ECO-BOT MINES",
            "",
            `💰 Bet: ${formatNumber(game.bet)}`,
            `💣 Mines: ${miningConfig.BOMBS}`,
            `💎 Safe Tiles: ${miningConfig.SAFE_TILES}`,
            "",
            formatActiveBoard(game.revealedTiles),
            "",
            "Choose a tile:",
            "/mine <1-9>"
        ].join("\n")
    };
}

function formatActiveGame(game) {
    return notAccepted([
        "⛏️ ACTIVE MINING GAME",
        "",
        `💰 Bet: ${formatNumber(game.bet)}`,
        `✨ Safe Mines: ${game.safeMines}/${miningConfig.MAX_SAFE_MINES}`,
        "",
        formatActiveBoard(game.revealedTiles),
        "",
        "Choose a tile or use:",
        "/mine out"
    ].join("\n"));
}

function formatAlreadyActiveGame(game) {
    return notAccepted([
        "⛏️ You already have an active mining game!",
        "",
        formatActiveBoard(game.revealedTiles),
        "",
        "Choose another tile or use:",
        "/mine out"
    ].join("\n"));
}

function formatSafeGame(game) {
    const payout = calculatePayout(game.bet, game.safeMines);
    return {
        type: "text",
        text: [
            "⛏️ SAFE! 💎",
            "",
            `💰 Bet: ${formatNumber(game.bet)}`,
            `📈 Multiplier: ${formatMultiplier(game.currentMultiplier)}`,
            `💵 Current Value: ${formatNumber(payout)}`,
            `✨ Safe Mines: ${game.safeMines}/${miningConfig.MAX_SAFE_MINES}`,
            "",
            formatActiveBoard(game.revealedTiles),
            "",
            "Choose another tile or:",
            "/mine out"
        ].join("\n")
    };
}

function formatCashout(game) {
    const profit = game.payout - game.bet;
    return {
        type: "text",
        text: [
            "💰 MINING CASHOUT!",
            "",
            `⛏️ Safe Mines: ${game.safeMines}/${miningConfig.MAX_SAFE_MINES}`,
            `📈 Multiplier: ${formatMultiplier(game.currentMultiplier)}`,
            `💰 Original Bet: ${formatNumber(game.bet)}`,
            `💵 Payout: ${formatNumber(game.payout)}`,
            `📈 Profit: +${formatNumber(profit)}`,
            "",
            formatCompletedBoard(game)
        ].join("\n")
    };
}

function formatCompletion(game) {
    const profit = game.payout - game.bet;
    return {
        type: "text",
        text: [
            `🎉 ${miningConfig.MAX_SAFE_MINES} SAFE MINES!`,
            "",
            `⛏️ Safe Mines: ${game.safeMines}/${miningConfig.MAX_SAFE_MINES}`,
            `📈 Final Multiplier: ${formatMultiplier(game.currentMultiplier)}`,
            `💰 Original Bet: ${formatNumber(game.bet)}`,
            `💵 Payout: ${formatNumber(game.payout)}`,
            `📈 Profit: +${formatNumber(profit)}`,
            "",
            formatCompletedBoard(game)
        ].join("\n")
    };
}

function formatBomb(game) {
    return {
        type: "text",
        text: [
            "💣 BOOM!",
            "",
            "You hit a mine!",
            "",
            formatCompletedBoard(game),
            "",
            `💰 Bet: ${formatNumber(game.bet)}`,
            `💸 Lost: ${formatNumber(game.bet)}`,
            "",
            "Game Over."
        ].join("\n")
    };
}

function formatNoMineYet(game) {
    return notAccepted([
        "⛏️ You haven't mined anything yet!",
        "",
        "Choose a tile first:",
        "",
        formatActiveBoard(game.revealedTiles)
    ].join("\n"));
}

function formatNoActiveGame() {
    return notAccepted("❌ You don't have an active mining game.");
}

async function ensurePayoutFitsBalance(instagramId, payout, session) {
    const user = await User.findOne({ instagramId })
        .select("coins")
        .session(session);

    if (!user) {
        throw new Error("User not found");
    }
    if (
        !Number.isSafeInteger(user.coins) ||
        !Number.isSafeInteger(user.coins + payout)
    ) {
        throw new Error("Mining payout is too large to process safely");
    }
}

async function startMiningGame(instagramId, username, bet, messageId, createBombPositionsFn) {
    await getOrCreateUser(instagramId, username);
    const bombPositions = createBombPositionsFn();
    const session = await mongoose.startSession();

    try {
        return await session.withTransaction(async () => {
            const existingGame = await MiningGame.findOne({
                instagramId,
                status: "active"
            }).session(session);
            if (existingGame) {
                return { status: "active", game: existingGame };
            }

            const user = await User.findOne({ instagramId })
                .select("coins")
                .session(session);
            if (!user) {
                throw new Error("User not found");
            }
            if (!Number.isSafeInteger(user.coins) || user.coins < bet) {
                return { status: "insufficient" };
            }

            const [game] = await MiningGame.create([{
                instagramId,
                bet,
                bombPositions,
                revealedTiles: [],
                safeMines: 0,
                currentMultiplier: 1,
                status: "active"
            }], { session });

            await removeCoins(
                instagramId,
                bet,
                "mine_bet",
                {
                    gameId: String(game._id),
                    messageId: messageId || null
                },
                session
            );

            return { status: "started", game };
        });
    } catch (error) {
        if (error?.code === 11000) {
            const activeGame = await MiningGame.findOne({
                instagramId,
                status: "active"
            });
            return { status: "active", game: activeGame };
        }
        throw error;
    } finally {
        await session.endSession();
    }
}

async function selectMiningTile(instagramId, tile, messageId) {
    const session = await mongoose.startSession();

    try {
        return await session.withTransaction(async () => {
            const game = await MiningGame.findOne({
                instagramId,
                status: "active"
            }).session(session);
            if (!game) {
                return { status: "no_active_game" };
            }

            validateStoredGame(game);

            if (game.revealedTiles.includes(tile)) {
                return { status: "duplicate_tile", game };
            }

            const endedAt = new Date(Date.now());
            if (game.bombPositions.includes(tile)) {
                const lostGame = await MiningGame.findOneAndUpdate(
                    { _id: game._id, status: "active" },
                    { $set: { status: "lost", endedAt } },
                    { returnDocument: "after", session, runValidators: true }
                );

                if (!lostGame) {
                    return { status: "state_changed" };
                }
                return { status: "bomb", game: lostGame };
            }

            const revealedTiles = [...game.revealedTiles, tile].sort((left, right) => left - right);
            const safeMines = revealedTiles.length;
            const multiplier = getMiningMultiplier(safeMines);
            const completesGame = safeMines === miningConfig.MAX_SAFE_MINES;
            const payout = completesGame ? calculatePayout(game.bet, safeMines) : null;

            if (completesGame) {
                await ensurePayoutFitsBalance(instagramId, payout, session);
            }

            const update = {
                revealedTiles,
                safeMines,
                currentMultiplier: multiplier
            };
            if (completesGame) {
                update.status = "completed";
                update.payout = payout;
                update.endedAt = endedAt;
            }

            const updatedGame = await MiningGame.findOneAndUpdate(
                {
                    _id: game._id,
                    status: "active",
                    revealedTiles: { $ne: tile }
                },
                { $set: update },
                { returnDocument: "after", session, runValidators: true }
            );

            if (!updatedGame) {
                return { status: "state_changed" };
            }

            if (completesGame) {
                await addCoins(
                    instagramId,
                    payout,
                    "mine_payout",
                    {
                        gameId: String(updatedGame._id),
                        messageId: messageId || null,
                        outcome: "completed",
                        safeMines,
                        multiplier
                    },
                    session
                );
                return { status: "completed", game: updatedGame };
            }

            return { status: "safe", game: updatedGame };
        });
    } finally {
        await session.endSession();
    }
}

async function cashOutMiningGame(instagramId, messageId) {
    const session = await mongoose.startSession();

    try {
        return await session.withTransaction(async () => {
            const game = await MiningGame.findOne({
                instagramId,
                status: "active"
            }).session(session);
            if (!game) {
                return { status: "no_active_game" };
            }

            validateStoredGame(game);
            if (game.safeMines === 0) {
                return { status: "no_safe_tiles", game };
            }

            const payout = calculatePayout(game.bet, game.safeMines);
            await ensurePayoutFitsBalance(instagramId, payout, session);

            const cashedOutGame = await MiningGame.findOneAndUpdate(
                {
                    _id: game._id,
                    status: "active",
                    safeMines: game.safeMines
                },
                {
                    $set: {
                        status: "cashed_out",
                        payout,
                        endedAt: new Date(Date.now())
                    }
                },
                { returnDocument: "after", session, runValidators: true }
            );

            if (!cashedOutGame) {
                return { status: "state_changed" };
            }

            await addCoins(
                instagramId,
                payout,
                "mine_payout",
                {
                    gameId: String(cashedOutGame._id),
                    messageId: messageId || null,
                    outcome: "cashed_out",
                    safeMines: cashedOutGame.safeMines,
                    multiplier: cashedOutGame.currentMultiplier
                },
                session
            );

            return { status: "cashed_out", game: cashedOutGame };
        });
    } finally {
        await session.endSession();
    }
}

function startUsageResponse() {
    return notAccepted([
        "⛏️ Mines",
        "",
        "Usage:",
        "",
        "/mine <amount>",
        "",
        "Example:",
        "",
        "/mine 6000"
    ].join("\n"));
}

function formatBetValidationError(error) {
    if (error === "non_positive") {
        return notAccepted("❌ Bet must be greater than 0.");
    }
    if (error === "below_minimum") {
        return notAccepted(`❌ Minimum bet is ${formatNumber(miningConfig.MIN_BET)} coins.`);
    }
    if (error === "above_maximum") {
        return notAccepted(`❌ Maximum bet is ${formatNumber(miningConfig.MAX_BET)} coins.`);
    }
    return notAccepted("❌ Invalid amount.");
}

function createMineCommand(createBombPositionsFn = createBombPositions) {
    return async function mineCommand({ message, args }) {
        validateMiningConfiguration();
        const instagramId = message.userId.trim();
        const commandArgs = Array.isArray(args) ? args : [];
        const activeGame = await MiningGame.findOne({
            instagramId,
            status: "active"
        });

        if (activeGame) {
            validateStoredGame(activeGame);

            if (commandArgs.length === 0) {
                return formatActiveGame(activeGame);
            }
            if (commandArgs.length !== 1) {
                return notAccepted("❌ Invalid tile.\n\nChoose a tile from 1 to 9 or use:\n\n/mine out");
            }

            const selection = commandArgs[0].toLowerCase();
            if (selection === "out") {
                const cashout = await cashOutMiningGame(instagramId, message.messageId);
                if (cashout.status === "cashed_out") {
                    return formatCashout(cashout.game);
                }
                if (cashout.status === "no_safe_tiles") {
                    return formatNoMineYet(cashout.game);
                }
                return formatNoActiveGame();
            }

            if (isConfiguredBet(selection)) {
                return formatAlreadyActiveGame(activeGame);
            }
            if (!/^\d+$/.test(selection)) {
                return notAccepted("❌ Invalid tile.\n\nChoose a tile from 1 to 9 or use:\n\n/mine out");
            }

            const tile = Number(selection);
            if (!Number.isSafeInteger(tile) || tile < 1 || tile > miningConfig.BOARD_SIZE) {
                return notAccepted("❌ Choose a tile from 1 to 9.");
            }

            const selectionResult = await selectMiningTile(instagramId, tile, message.messageId);
            if (selectionResult.status === "safe") {
                return formatSafeGame(selectionResult.game);
            }
            if (selectionResult.status === "completed") {
                return formatCompletion(selectionResult.game);
            }
            if (selectionResult.status === "bomb") {
                return formatBomb(selectionResult.game);
            }
            if (selectionResult.status === "duplicate_tile") {
                return notAccepted(`❌ You already mined tile ${tile}.\n\nChoose another tile.`);
            }
            return formatNoActiveGame();
        }

        if (commandArgs.length === 0) {
            return startUsageResponse();
        }
        if (commandArgs.length !== 1) {
            return notAccepted("❌ Invalid amount.");
        }

        const parsedBet = parseBet(commandArgs[0]);
        if (!parsedBet.amount) {
            return formatBetValidationError(parsedBet.error);
        }

        const startResult = await startMiningGame(
            instagramId,
            message.username,
            parsedBet.amount,
            message.messageId,
            createBombPositionsFn
        );

        if (startResult.status === "started") {
            return formatStart(startResult.game);
        }
        if (startResult.status === "insufficient") {
            return notAccepted("❌ You don't have enough coins.");
        }
        if (startResult.status === "active") {
            return formatAlreadyActiveGame(startResult.game);
        }

        throw new Error("Unexpected mining game start state");
    };
}

const mineCommand = createMineCommand();

module.exports = mineCommand;
module.exports.createMineCommand = createMineCommand;
module.exports.createBombPositions = createBombPositions;
module.exports.calculatePayout = calculatePayout;
module.exports.parseBet = parseBet;
module.exports.formatActiveBoard = formatActiveBoard;
module.exports.formatCompletedBoard = formatCompletedBoard;
