import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from 'discord.js';
import express from 'express';
import fetch from 'node-fetch';

// التوكن من Environment Variable
const TOKEN = process.env.DISCORD_TOKEN;

// هات دول من Discord Developer Portal
const CLIENT_ID = 'اكتب هنا الـ Client ID للبوت';
const GUILD_ID = 'اكتب هنا الـ Guild ID للسيرفر التجريبي';

const API_URL = 'https://attack-roblox-api-xxxxx-ew.a.run.app/get-balance/';

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// ✨ تعريف الأمر
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

// ✨ تسجيل الأمر عند تشغيل البوت
const rest = new REST({ version: '10' }).setToken(TOKEN);

async function registerCommands() {
  try {
    console.log('📝 Registering slash commands...');
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log('✅ Slash commands registered!');
  } catch (err) {
    console.error('❌ Failed to register commands:', err);
  }
}

client.on('ready', () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
  registerCommands(); // <-- يسجّل الأوامر بعد ما البوت يعمل login
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'bal') {
    const userId = interaction.options.getString('userid');
    try {
      const res = await fetch(API_URL + userId);
      if (!res.ok) throw new Error('Failed to fetch balance');
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
web.get('/', (_, res) => res.send('🤖 Bot is running!'));
web.listen(8080, () => console.log('🌐 Web server listening on port 8080'));
