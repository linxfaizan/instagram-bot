const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
    miningConfig,
    validateMiningConfiguration,
    getMiningMultiplier
} = require("../src/config/mining");
const {
    createBombPositions,
    calculatePayout,
    parseBet,
    formatActiveBoard,
    formatCompletedBoard
} = require("../src/commands/mine");

test("mining configuration produces a valid hidden board and whole-coin payouts", () => {
    assert.equal(validateMiningConfiguration(), true);
    assert.equal(miningConfig.BOARD_SIZE, miningConfig.BOMBS + miningConfig.SAFE_TILES);
    assert.equal(miningConfig.MAX_SAFE_MINES, 3);
    assert.equal(getMiningMultiplier(1), 1.35);
    assert.equal(getMiningMultiplier(2), 2.05);
    assert.equal(getMiningMultiplier(3), 3.25);

    const randomValues = [2, 2, 4, 7];
    const bombs = createBombPositions(() => randomValues.shift());
    assert.deepEqual(bombs, [2, 4, 7]);
    assert.equal(new Set(bombs).size, miningConfig.BOMBS);
    assert.equal(
        Array.from({ length: miningConfig.BOARD_SIZE }, (_, index) => index + 1)
            .filter((tile) => !bombs.includes(tile)).length,
        miningConfig.SAFE_TILES
    );

    assert.equal(calculatePayout(6000, 1), 8100);
    assert.equal(calculatePayout(6000, 2), 12300);
    assert.equal(calculatePayout(6000, 3), 19500);
    assert.equal(calculatePayout(101, 1), 136);
    assert.deepEqual(parseBet("6000"), { amount: 6000 });
    assert.deepEqual(parseBet("0"), { error: "non_positive" });
    assert.deepEqual(parseBet("-500"), { error: "non_positive" });
    assert.deepEqual(parseBet("abc"), { error: "invalid" });

    const activeBoard = formatActiveBoard([1, 5]);
    assert.match(activeBoard, /✅/);
    assert.doesNotMatch(activeBoard, /💣|💎/);

    const completedBoard = formatCompletedBoard({ bombPositions: bombs });
    assert.equal((completedBoard.match(/💣/g) || []).length, miningConfig.BOMBS);
    assert.equal((completedBoard.match(/💎/g) || []).length, miningConfig.SAFE_TILES);
});
