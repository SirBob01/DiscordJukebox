require("dotenv").config();
const discord = require("discord.js");

const client = new discord.Client({intents: discord.Intents.FLAGS.GUILDS});
client.once('ready', () => {
    console.log("DiscordRecords is online.");
});

client.login(process.env.LOGIN_KEY);