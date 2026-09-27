const dns = require("node:dns");
const mongoose = require("mongoose");

dns.setServers(["1.1.1.1", "8.8.8.8"]);

async function connectDatabase() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        console.log("✅ MongoDB connected");
    } catch (error) {
        console.error("❌ MongoDB connection failed:");
        console.error(error.message);
        process.exit(1);
    }
}

module.exports = connectDatabase;