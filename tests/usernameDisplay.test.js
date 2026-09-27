const assert = require("node:assert/strict");
const { test } = require("node:test");
const { formatLeaderboard } = require("../src/commands/leaderboard");
const { formatProfile } = require("../src/commands/profile");

test("leaderboard displays the stored Instagram username", () => {
    const response = formatLeaderboard([
        {
            username: "Real.Profile",
            coins: 12_345
        }
    ], 1);

    assert.match(response, /@Real\.Profile/);
    assert.doesNotMatch(response, /@unknown/);
});

test("profile displays the stored Instagram username", () => {
    const response = formatProfile({
        username: "Real.Profile",
        coins: 12_345,
        level: 1,
        xp: 0,
        workLevel: 1,
        workXp: 0,
        job: null
    });

    assert.match(response, /👤 @Real\.Profile/);
    assert.doesNotMatch(response, /👤 @user/);
});
