import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from 'discord.js';
import express from 'express';
import fetch from 'node-fetch';

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = '1386338165916438538';
const GUILD_ID = '1380367982986793010';
const API_URL = 'https://attack-roblox-api-135053415446.europe-west3.run.app/get-balance/';

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const commands = [
  new SlashCommandBuilder()
    .setName('bal')
    .setDescription('💰 Show balance of a Roblox user')
    .addStringOption(option =>
      option.setName('userid')
        .setDescription('Roblox UserId')
        .setRequired(true)
    )
    .toJSON()
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

async function registerCommands() {
  try {
    console.log('Registering slash commands...');
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log('Slash commands registered!');
  } catch (err) {
    console.error('Command registration failed:', err);
  }
}

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  registerCommands();
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'bal') {
    const userId = interaction.options.getString('userid');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500); // 2.5s timeout

    try {
      const response = await fetch(API_URL + userId, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text}`);
      }

      const data = await response.json();
      await interaction.reply(`💰 Balance for **${userId}** is: **${data.balance}**`);
    } catch (err) {
      clearTimeout(timeout);
      console.error('Fetch error:', err.message);
      await interaction.reply(`❌ Failed to fetch balance: ${err.message}`);
    }
  }
});

client.login(TOKEN);

const web = express();
web.get('/', (_, res) => res.send('Bot is running'));
web.listen(8080, () => console.log('Web server running on port 8080'));
