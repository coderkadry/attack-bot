import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from 'discord.js';
import express from 'express';
import fetch from 'node-fetch';

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = '1386338165916438538';
const GUILD_ID = '1380367982986793010';
const API_BASE = 'https://attack-roblox-api-135053415446.europe-west3.run.app';

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
    ),
  new SlashCommandBuilder()
    .setName('register')
    .setDescription('🔗 Register your Roblox account with your Discord')
    .addStringOption(option =>
      option.setName('userid')
        .setDescription('Your Roblox UserId')
        .setRequired(true)
    ),
].map(cmd => cmd.toJSON());

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

  const userId = interaction.options.getString('userid');
  const discordId = interaction.user.id;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);

  try {
    if (interaction.commandName === 'bal') {
      const res = await fetch(`${API_BASE}/get-balance/${userId}`, { signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      await interaction.reply(`💰 Balance for **${userId}** is: **${data.balance}**`);
    }

    if (interaction.commandName === 'register') {
      const res = await fetch(`${API_BASE}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          discordId,
          robloxId: userId
        }),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }

      await interaction.reply(`✅ Linked Roblox ID **${userId}** with your Discord.`);
    }
  } catch (err) {
    clearTimeout(timeout);
    console.error('Command error:', err.message);
    await interaction.reply(`❌ Error: ${err.message}`);
  }
});

client.login(TOKEN);

const web = express();
web.get('/', (_, res) => res.send('Bot is running'));
web.listen(8080, () => console.log('Web server running on port 8080'));
