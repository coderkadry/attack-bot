import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from 'discord.js';
import express from 'express';
import fetch from 'node-fetch';

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = 'PUT_YOUR_CLIENT_ID_HERE';
const GUILD_ID = 'PUT_YOUR_GUILD_ID_HERE';
const API_URL = 'https://attack-roblox-api-135053415446.europe-west3.run.app/update-balance';

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const commands = [
  new SlashCommandBuilder()
    .setName('bal')
    .setDescription('💰 Get a player\'s Roblox balance')
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
    console.log('📝 Registering slash command...');
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log('✅ Slash command registered!');
  } catch (err) {
    console.error('❌ Command registration failed:', err);
  }
}

client.on('ready', () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'bal') {
    const userId = interaction.options.getString('userid');

    try {
      const res = await fetch(API_URL + userId);
      if (!res.ok) throw new Error('API error or user not found');
      const data = await res.json();
      await interaction.reply(`💰 Balance for **${userId}** is: **${data.balance}**`);
    } catch (err) {
      await interaction.reply('❌ Could not fetch balance.');
    }
  }
});

client.login(TOKEN);

// Web server for Cloud Run
const web = express();
web.get('/', (_, res) => res.send('🤖 Discord bot is running!'));
web.listen(8080, () => console.log('🌐 Web server listening on port 8080'));

registerCommands();
