const assert = require("node:assert/strict");
const { test } = require("node:test");
const InstagramAccount = require("../src/models/InstagramAccount");
const {
    getInstagramUserProfile,
    clearInstagramProfileCache
} = require("../src/services/instagramService");

function mockJsonResponse(body, ok = true, status = ok ? 200 : 400) {
    return {
        ok,
        status,
        json: async () => body
    };
}

async function withMockedInstagramAccountAndFetch(callback) {
    const originalFindOne = InstagramAccount.findOne;
    const originalFetch = global.fetch;

    InstagramAccount.findOne = async () => ({
        instagramUserId: "connected-instagram-account",
        accessToken: "test-access-token",
        tokenExpiresAt: new Date(Date.now() + 60_000)
    });

    clearInstagramProfileCache();
    try {
        await callback((fetchImplementation) => {
            global.fetch = fetchImplementation;
        });
    } finally {
        clearInstagramProfileCache();
        InstagramAccount.findOne = originalFindOne;
        global.fetch = originalFetch;
    }
}

test("Instagram profile lookup uses the official Graph endpoint and caches a username", async () => {
    await withMockedInstagramAccountAndFetch(async (setFetch) => {
        let requestCount = 0;

        setFetch(async (url, options) => {
            requestCount += 1;
            const requestUrl = new URL(url);

            assert.equal(
                requestUrl.href,
                "https://graph.instagram.com/v26.0/ig-scoped-user?fields=id%2Cusername"
            );
            assert.equal(options.method, undefined);
            assert.equal(options.headers.Authorization, "Bearer test-access-token");

            return mockJsonResponse({
                id: "ig-scoped-user",
                username: "Real.Profile"
            });
        });

        const firstProfile = await getInstagramUserProfile("ig-scoped-user");
        const cachedProfile = await getInstagramUserProfile("ig-scoped-user");

        assert.deepEqual(firstProfile, {
            id: "ig-scoped-user",
            username: "Real.Profile"
        });
        assert.deepEqual(cachedProfile, firstProfile);
        assert.equal(requestCount, 1);
    });
});

test("concurrent Instagram profile lookups share a single Graph request", async () => {
    await withMockedInstagramAccountAndFetch(async (setFetch) => {
        let requestCount = 0;
        let releaseResponse;
        const responseReady = new Promise((resolve) => {
            releaseResponse = resolve;
        });

        setFetch(async () => {
            requestCount += 1;
            await responseReady;
            return mockJsonResponse({
                id: "concurrent-user",
                username: "concurrent_user"
            });
        });

        const firstLookup = getInstagramUserProfile("concurrent-user");
        const secondLookup = getInstagramUserProfile("concurrent-user");
        releaseResponse();

        assert.deepEqual(await Promise.all([firstLookup, secondLookup]), [
            { id: "concurrent-user", username: "concurrent_user" },
            { id: "concurrent-user", username: "concurrent_user" }
        ]);
        assert.equal(requestCount, 1);
    });
});

test("Instagram profile lookup validates the sender ID", async () => {
    await assert.rejects(
        getInstagramUserProfile("   "),
        /Instagram scoped ID is required/
    );
});
