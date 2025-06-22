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

// Define commands
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

// Register slash commands
const rest = new REST({ version: '10' }).setToken(TOKEN);
async function registerCommands() {
  try {
    console.log('📦 Registering commands...');
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
      body: commands,
    });
    console.log('✅ Commands registered!');
  } catch (err) {
    console.error('❌ Failed to register commands:', err.message);
  }
}

// Handle commands
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = interaction.commandName;
  const userId = interaction.options.getString('userid');
  const discordId = interaction.user.id;

  try {
    await interaction.deferReply();

    if (command === 'bal') {
      const res = await fetch(`${API_BASE}/get-balance/${userId}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(`API Error ${res.status}: ${JSON.stringify(data)}`);
      }

      await interaction.editReply(`💰 Balance for **${userId}** is: **${data.balance}**`);
    }

    else if (command === 'register') {
      const res = await fetch(`${API_BASE}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          discordId,
          robloxId: userId
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(`API Error ${res.status}: ${JSON.stringify(data)}`);
      }

      await interaction.editReply(`✅ Successfully linked Roblox ID **${userId}** with your Discord.`);
    }

  } catch (err) {
    console.error('❌ Error handling command:', err.message);
    const errorMsg = `❌ Error: ${err.message || 'Something went wrong.'}`;
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(errorMsg);
    } else {
      await interaction.reply(errorMsg);
    }
  }
});

// Bot ready
client.once('ready', () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
  registerCommands();
});

// Web server for Cloud Run
const web = express();
web.get('/', (_, res) => res.send('Bot is running ✅'));
web.listen(8080, () => console.log('🌐 Web server running on port 8080'));

// Start bot
client.login(TOKEN);
