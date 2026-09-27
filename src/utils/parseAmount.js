const suffixMultipliers = {
    k: 1_000n,
    m: 1_000_000n,
    b: 1_000_000_000n,
    t: 1_000_000_000_000n
};

const maximumSafeAmount = BigInt(Number.MAX_SAFE_INTEGER);

function parseAmount(input) {
    if (typeof input !== "string" || input.length > 64) {
        throw new Error("Invalid amount");
    }

    const match = /^(\d+|\d{1,3}(?:,\d{3})+)(?:\.(\d+))?([kmbt]?)$/i.exec(input.trim());
    if (!match) {
        throw new Error("Invalid amount");
    }

    const [, integerDigits, fractionalDigits = "", suffix] = match;
    const digits = `${integerDigits.replace(/,/g, "")}${fractionalDigits}`;
    const numerator = BigInt(digits) * (suffixMultipliers[suffix.toLowerCase()] ?? 1n);
    const denominator = 10n ** BigInt(fractionalDigits.length);

    if (numerator % denominator !== 0n) {
        throw new Error("Amount must be a whole number of coins");
    }

    const amount = numerator / denominator;
    if (amount <= 0n) {
        throw new Error("Invalid amount");
    }
    if (amount > maximumSafeAmount) {
        throw new Error("Amount is too large to process safely");
    }

    return Number(amount);
}

module.exports = { parseAmount };
