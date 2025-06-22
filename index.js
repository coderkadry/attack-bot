import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from 'discord.js';
import express from 'express';
import fetch from 'node-fetch';

// التوكن من Environment Variable (اتضاف كـ Secret في Google Cloud)
const TOKEN = process.env.DISCORD_TOKEN;

// ✅ معلومات البوت
const CLIENT_ID = '1386338165916438538'; // Application (bot) ID
const GUILD_ID = '1380367982986793010';  // Server ID (guild)

const API_URL = 'https://attack-roblox-api-135053415446.europe-west3.run.app/get-balance/'; // استبدله بالرابط الحقيقي لو اتغير

// إنشاء البوت
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// ✅ تعريف أمر /bal
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

// ✅ تسجيل الأمر وقت التشغيل
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

// ✅ عند تشغيل البوت
client.once('ready', () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
  registerCommands();
});

// ✅ التعامل مع الأمر /bal
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

// ✅ تشغيل البوت
client.login(TOKEN);

// ✅ ويب سيرفر صغير لـ Cloud Run
const web = express();
web.get('/', (_, res) => res.send('🤖 Bot is running!'));
web.listen(8080, () => console.log('🌐 Web server running on port 8080'));
