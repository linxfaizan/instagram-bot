const InstagramAccount = require("../models/InstagramAccount");
const {
    INSTAGRAM_GRAPH_API_BASE_URL
} = require("../config/instagram");

const PROFILE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const profileCache = new Map();
const profileLookupsInFlight = new Map();

function normalizeInstagramScopedId(instagramScopedId) {
    if (typeof instagramScopedId !== "string" || instagramScopedId.trim() === "") {
        throw new Error("Instagram scoped ID is required.");
    }

    return instagramScopedId.trim();
}

function normalizeProfileUsername(username) {
    if (typeof username !== "string") {
        return null;
    }

    const normalizedUsername = username.trim().replace(/^@/, "");
    return normalizedUsername || null;
}

async function getInstagramAccount() {
    const account = await InstagramAccount.findOne();

    if (!account) {
        throw new Error("No Instagram account connected.");
    }

    if (
        account.tokenExpiresAt &&
        account.tokenExpiresAt.getTime() <= Date.now()
    ) {
        throw new Error("Instagram access token has expired.");
    }

    return account;
}

async function sendMessage(recipientId, text) {
    if (!recipientId) {
        throw new Error("Instagram recipient ID is required.");
    }

    if (!text || typeof text !== "string") {
        throw new Error("Instagram message text is required.");
    }

    const account = await getInstagramAccount();

    const response = await fetch(
        `${INSTAGRAM_GRAPH_API_BASE_URL}/me/messages`,
        {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${account.accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                recipient: {
                    id: String(recipientId)
                },
                message: {
                    text
                }
            })
        }
    );

    const data = await response.json();

    if (!response.ok) {
        console.error(
            "Instagram send message failed:",
            data
        );

        throw new Error(
            data?.error?.message ||
            "Instagram message failed."
        );
    }

    return data;
}

async function fetchInstagramUserProfile(instagramScopedId) {
    const account = await getInstagramAccount();
    const url = new URL(
        `${INSTAGRAM_GRAPH_API_BASE_URL}/${encodeURIComponent(instagramScopedId)}`
    );
    url.searchParams.set("fields", "id,username");

    const response = await fetch(url, {
        headers: {
            "Authorization": `Bearer ${account.accessToken}`
        }
    });
    const data = await response.json();

    if (!response.ok) {
        console.error("Instagram profile lookup failed:", data);
        throw new Error(
            data?.error?.message ||
            "Instagram profile lookup failed."
        );
    }

    return {
        id: typeof data?.id === "string" ? data.id : instagramScopedId,
        username: normalizeProfileUsername(data?.username)
    };
}

async function getInstagramUserProfile(instagramScopedId) {
    const normalizedId = normalizeInstagramScopedId(instagramScopedId);
    const now = Date.now();
    const cached = profileCache.get(normalizedId);

    if (cached && cached.expiresAt > now) {
        return cached.profile;
    }

    if (cached) {
        profileCache.delete(normalizedId);
    }

    const inFlightLookup = profileLookupsInFlight.get(normalizedId);
    if (inFlightLookup) {
        return inFlightLookup;
    }

    const lookup = fetchInstagramUserProfile(normalizedId)
        .then((profile) => {
            profileCache.set(normalizedId, {
                profile,
                expiresAt: Date.now() + PROFILE_CACHE_TTL_MS
            });
            return profile;
        })
        .finally(() => {
            profileLookupsInFlight.delete(normalizedId);
        });

    profileLookupsInFlight.set(normalizedId, lookup);
    return lookup;
}

function clearInstagramProfileCache() {
    profileCache.clear();
    profileLookupsInFlight.clear();
}

module.exports = {
    getInstagramAccount,
    sendMessage,
    getInstagramUserProfile,
    clearInstagramProfileCache
};
