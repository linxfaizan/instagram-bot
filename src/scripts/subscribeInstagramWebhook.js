require("dotenv").config();

const connectDatabase = require("../config/database");
const InstagramAccount = require("../models/InstagramAccount");
const {
    INSTAGRAM_GRAPH_API_BASE_URL
} = require("../config/instagram");

async function subscribeInstagramWebhook() {
    await connectDatabase();

    const account = await InstagramAccount.findOne();

    if (!account) {
        throw new Error("No Instagram account connected.");
    }

    if (!account.accessToken) {
        throw new Error("Instagram access token is missing.");
    }

    if (
        account.tokenExpiresAt &&
        account.tokenExpiresAt.getTime() <= Date.now()
    ) {
        throw new Error("Instagram access token has expired.");
    }

    const url = `${INSTAGRAM_GRAPH_API_BASE_URL}/me/subscribed_apps`;

    const params = new URLSearchParams({
        subscribed_fields: "messages"
    });

    console.log(
        "📡 Subscribing Instagram account to messages..."
    );

    const response = await fetch(
        `${url}?${params.toString()}`,
        {
            method: "POST",
            headers: {
                Authorization:
                    `Bearer ${account.accessToken}`
            }
        }
    );

    const data = await response.json();

    if (!response.ok || data.success !== true) {
        console.error(
            "❌ Instagram webhook subscription failed:"
        );

        console.error(
            JSON.stringify(data, null, 2)
        );

        process.exitCode = 1;
        return;
    }

    console.log(
        "✅ Instagram account subscribed successfully!"
    );

    console.log(
        JSON.stringify(data, null, 2)
    );
}

subscribeInstagramWebhook()
    .catch((error) => {
        console.error(
            "❌ Subscription script failed:"
        );

        console.error(error.message);

        process.exitCode = 1;
    });
