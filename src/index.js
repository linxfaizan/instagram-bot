require("dotenv").config();

const express = require("express");
const connectDatabase = require("./config/database");
const instagramWebhook = require("./webhooks/instagramWebhook");
const instagramAuth = require("./routes/instagramAuth");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get("/", (req, res) => {
    res.send("🤖 Eco-Bot is running");
});

app.use("/webhook", instagramWebhook);
app.use("/auth/instagram", instagramAuth);

async function start() {
    await connectDatabase();

    app.listen(PORT, () => {
        console.log(`🌐 Eco-Bot listening on port ${PORT}`);
        console.log("🤖 Eco-Bot core started");
    });
}

start();
