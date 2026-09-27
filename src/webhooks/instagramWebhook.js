const express = require("express");
const { handleMessage } = require("../core/bot");
const {
    sendMessage,
    getInstagramUserProfile
} = require("../services/instagramService");
const { getOrCreateUser } = require("../services/userService");

async function processMessagingEvent(messaging, dependencies = {}) {
    const handleMessageFn = dependencies.handleMessage ?? handleMessage;
    const sendMessageFn = dependencies.sendMessage ?? sendMessage;
    const getInstagramUserProfileFn =
        dependencies.getInstagramUserProfile ?? getInstagramUserProfile;
    const getOrCreateUserFn =
        dependencies.getOrCreateUser ?? getOrCreateUser;
    const logger = dependencies.logger ?? console;

    const senderId = messaging?.sender?.id;
    const messageText = messaging?.message?.text;

    if (!senderId || !messageText) {
        return null;
    }

    const userId = String(senderId);
    let username = null;

    try {
        const profile = await getInstagramUserProfileFn(userId);
        username = profile?.username ?? null;
    } catch (error) {
        logger.error("Instagram sender profile lookup error:", error.message);
    }

    if (username) {
        try {
            await getOrCreateUserFn(userId, username);
        } catch (error) {
            logger.error("Instagram sender profile save error:", error.message);
        }
    }

    logger.log(`📩 Instagram DM from ${userId}: ${messageText}`);

    const response = await handleMessageFn({
        userId,
        username,
        text: messageText
    });

    if (
        response?.type === "text" &&
        typeof response.text === "string"
    ) {
        await sendMessageFn(senderId, response.text);
    }

    return response;
}

function createInstagramWebhook(dependencies = {}) {
    const router = express.Router();

router.get("/", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (
        mode === "subscribe" &&
        token &&
        token === process.env.META_VERIFY_TOKEN
    ) {
        return res.status(200).send(challenge);
    }

    return res.sendStatus(403);
});

router.post("/", async (req, res) => {
    // Acknowledge Meta immediately.
    res.sendStatus(200);

    try {
        const body = req.body;

        if (!body || body.object !== "instagram") {
            return;
        }

        for (const entry of body.entry ?? []) {
            for (const messaging of entry.messaging ?? []) {

                // Debug: show the complete Meta messaging event.
                console.log(
                    "📦 META MESSAGING EVENT:",
                    JSON.stringify(messaging, null, 2)
                );

                await processMessagingEvent(messaging, dependencies);
            }
        }
    } catch (error) {
        console.error(
            "Instagram webhook processing error:",
            error
        );
    }
    });

    return router;
}

const router = createInstagramWebhook();
module.exports = router;
module.exports.createInstagramWebhook = createInstagramWebhook;
module.exports.processMessagingEvent = processMessagingEvent;
