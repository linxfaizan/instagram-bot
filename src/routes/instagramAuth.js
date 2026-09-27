const express = require("express");
const InstagramAccount = require("../models/InstagramAccount");

const router = express.Router();

router.get("/callback", async (req, res) => {
    const {
        code,
        error,
        error_reason,
        error_description
    } = req.query;

    if (error) {
        console.error("Instagram Login error:", {
            error,
            error_reason,
            error_description
        });

        return res.status(400).send(
            "Instagram authorization failed."
        );
    }

    if (!code) {
        return res.status(400).send(
            "Missing authorization code."
        );
    }

    try {
        // Step 1:
        // Authorization code -> short-lived access token
        const form = new URLSearchParams({
            client_id: process.env.META_INSTAGRAM_CLIENT_ID,
            client_secret: process.env.META_INSTAGRAM_CLIENT_SECRET,
            grant_type: "authorization_code",
            redirect_uri: process.env.META_INSTAGRAM_REDIRECT_URI,
            code
        });

        const shortTokenResponse = await fetch(
            "https://api.instagram.com/oauth/access_token",
            {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/x-www-form-urlencoded"
                },
                body: form
            }
        );

        const shortTokenData =
            await shortTokenResponse.json();

        if (!shortTokenResponse.ok) {
            console.error(
                "Instagram short-token exchange failed:",
                shortTokenData
            );

            return res.status(502).send(
                "Instagram token exchange failed."
            );
        }

        const shortToken =
            shortTokenData.access_token;

        const instagramUserId =
            shortTokenData.user_id;

        if (!shortToken || !instagramUserId) {
            console.error(
                "Unexpected short-token response."
            );

            return res.status(502).send(
                "Invalid Instagram token response."
            );
        }

        // Step 2:
        // Short-lived token -> long-lived token
        const longTokenUrl = new URL(
            "https://graph.instagram.com/access_token"
        );

        longTokenUrl.searchParams.set(
            "grant_type",
            "ig_exchange_token"
        );

        longTokenUrl.searchParams.set(
            "client_secret",
            process.env.META_INSTAGRAM_CLIENT_SECRET
        );

        longTokenUrl.searchParams.set(
            "access_token",
            shortToken
        );

        const longTokenResponse =
            await fetch(longTokenUrl);

        const longTokenData =
            await longTokenResponse.json();

        if (!longTokenResponse.ok) {
            console.error(
                "Instagram long-token exchange failed:",
                longTokenData
            );

            return res.status(502).send(
                "Instagram long-lived token exchange failed."
            );
        }

        const longToken =
            longTokenData.access_token;

        const expiresIn =
            longTokenData.expires_in;

        if (!longToken) {
            console.error(
                "No long-lived access token returned."
            );

            return res.status(502).send(
                "Invalid long-lived token response."
            );
        }

        // Calculate token expiration time
        const tokenExpiresAt = new Date(
            Date.now() +
            Number(expiresIn) * 1000
        );

        // Save/update Instagram account
        await InstagramAccount.findOneAndUpdate(
            {
                instagramUserId:
                    String(instagramUserId)
            },
            {
                instagramUserId:
                    String(instagramUserId),

                accessToken: longToken,

                tokenExpiresAt
            },
            {
                upsert: true,
                new: true,
                setDefaultsOnInsert: true
            }
        );

        console.log(
            "✅ Instagram authentication successful"
        );

        console.log(
            "Instagram User ID:",
            instagramUserId
        );

        console.log(
            "Instagram token expires at:",
            tokenExpiresAt.toISOString()
        );

        // IMPORTANT:
        // Never log the access token.

        return res.send(
            "✅ Instagram connected successfully. You can close this page."
        );

    } catch (error) {
        console.error(
            "Instagram authentication error:",
            error.message
        );

        return res.status(500).send(
            "Instagram authentication failed."
        );
    }
});

module.exports = router;
