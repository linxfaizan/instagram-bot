const MARRIAGE_PROPOSAL_TTL_MS = 24 * 60 * 60 * 1000;
const DIVORCE_CONFIRM_TTL_MS = 5 * 60 * 1000;

const MARRIAGE_RING_IDS = Object.freeze([
    "silver_ring",
    "diamond_ring",
    "royal_ring",
    "eternal_ring"
]);

module.exports = {
    MARRIAGE_PROPOSAL_TTL_MS,
    DIVORCE_CONFIRM_TTL_MS,
    MARRIAGE_RING_IDS
};