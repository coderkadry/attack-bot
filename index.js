import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
} from 'discord.js';
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
    .setDescription('💰 Show your registered Roblox balance'),

  new SlashCommandBuilder()
    .setName('register')
    .setDescription('🔗 Link or change your Roblox ID')
    .addStringOption(option =>
      option.setName('userid')
        .setDescription('Your Roblox UserId')
        .setRequired(true)
    ),
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

async function registerCommands() {
  try {
    console.log('📦 Registering commands...');
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log('✅ Slash commands registered!');
  } catch (err) {
    console.error('❌ Command registration failed:', err.message);
  }
}

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = interaction.commandName;
  const discordId = interaction.user.id;

  try {
    await interaction.deferReply();

    if (command === 'bal') {
      console.log(`🔍 Checking balance for Discord ID: ${discordId}`);
      
      const res = await fetch(`${API_BASE}/get-link/${discordId}`);
      const text = await res.text();
      
      console.log(`📡 Link API Response: ${res.status} - ${text}`);

      if (!res.ok) {
        if (res.status === 404) {
          const embed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('❌ You are not registered')
            .setDescription('Use /register to link your Roblox UserId first.');
          return await interaction.editReply({ embeds: [embed] });
        }
        throw new Error(`API ${res.status}: ${text}`);
      }

      const linkData = JSON.parse(text);
      const robloxId = linkData.robloxId;
      
      console.log(`🎮 Found linked Roblox ID: ${robloxId}`);

      if (!robloxId) {
        const embed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('❌ No Roblox ID linked')
          .setDescription('Please register first using /register.');
        return await interaction.editReply({ embeds: [embed] });
      }

      const balRes = await fetch(`${API_BASE}/get-balance/${robloxId}`);
      const balText = await balRes.text();
      
      console.log(`💰 Balance API Response: ${balRes.status} - ${balText}`);

      if (!balRes.ok) {
        if (balRes.status === 404) {
          const embed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('❌ Roblox user not found')
            .setDescription('Please re-register with the correct ID.');
          return await interaction.editReply({ embeds: [embed] });
        }
        throw new Error(`API ${balRes.status}: ${balText}`);
      }

      const balData = JSON.parse(balText);
      if (typeof balData.balance !== 'number') {
        throw new Error(`Invalid balance response: ${balText}`);
      }

      const embed = new EmbedBuilder()
        .setColor(0x00FF99)
        .setTitle('💰 Your Balance')
        .setDescription(`Roblox ID: **${robloxId}**\nBalance: **${balData.balance}**`)
        .setFooter({ text: 'Powered by Attack Roblox' });

      await interaction.editReply({ embeds: [embed] });
    }

    if (command === 'register') {
      const userId = interaction.options.getString('userid');
      
      console.log(`📝 Registering Discord ID ${discordId} with Roblox ID ${userId}`);

      // First, check if user already exists in the system
      const checkRes = await fetch(`${API_BASE}/get-balance/${userId}`);
      const checkText = await checkRes.text();
      
      console.log(`🔍 Roblox user check: ${checkRes.status} - ${checkText}`);
      
      let userExists = false;
      let currentBalance = 0;
      
      if (checkRes.ok) {
        // User exists, get their current balance
        const balData = JSON.parse(checkText);
        userExists = true;
        currentBalance = balData.balance || 0;
        console.log(`✅ User exists with balance: ${currentBalance}`);
      } else if (checkRes.status === 404) {
        // User doesn't exist, will be created with 0 balance
        console.log(`🆕 User doesn't exist, will create with 0 balance`);
        userExists = false;
        currentBalance = 0;
      } else {
        throw new Error(`Balance check failed: ${checkRes.status} - ${checkText}`);
      }

      // Try different registration endpoints/methods
      let registrationSuccess = false;
      let registrationResponse = null;
      
      // Method 1: Try POST /register
      try {
        const res1 = await fetch(`${API_BASE}/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ discordId, robloxId: userId }),
        });
        const text1 = await res1.text();
        console.log(`🔗 Registration Method 1 (POST /register): ${res1.status} - ${text1}`);
        
        if (res1.ok) {
          registrationSuccess = true;
          registrationResponse = text1;
        }
      } catch (err) {
        console.log(`❌ Registration Method 1 failed: ${err.message}`);
      }
      
      // Method 2: Try PUT /register (if first method failed)
      if (!registrationSuccess) {
        try {
          const res2 = await fetch(`${API_BASE}/register`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ discordId, robloxId: userId }),
          });
          const text2 = await res2.text();
          console.log(`🔗 Registration Method 2 (PUT /register): ${res2.status} - ${text2}`);
          
          if (res2.ok) {
            registrationSuccess = true;
            registrationResponse = text2;
          }
        } catch (err) {
          console.log(`❌ Registration Method 2 failed: ${err.message}`);
        }
      }
      
      // Method 3: Try POST /link (if previous methods failed)
      if (!registrationSuccess) {
        try {
          const res3 = await fetch(`${API_BASE}/link`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ discordId, robloxId: userId }),
          });
          const text3 = await res3.text();
          console.log(`🔗 Registration Method 3 (POST /link): ${res3.status} - ${text3}`);
          
          if (res3.ok) {
            registrationSuccess = true;
            registrationResponse = text3;
          }
        } catch (err) {
          console.log(`❌ Registration Method 3 failed: ${err.message}`);
        }
      }
      
      // Method 4: Try with different body format
      if (!registrationSuccess) {
        try {
          const res4 = await fetch(`${API_BASE}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ discord_id: discordId, roblox_id: userId }),
          });
          const text4 = await res4.text();
          console.log(`🔗 Registration Method 4 (different format): ${res4.status} - ${text4}`);
          
          if (res4.ok) {
            registrationSuccess = true;
            registrationResponse = text4;
          }
        } catch (err) {
          console.log(`❌ Registration Method 4 failed: ${err.message}`);
        }
      }

      if (!registrationSuccess) {
        const embed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('❌ Registration failed')
          .setDescription(`Unable to register with the API. All registration methods failed.\nPlease contact an administrator.\n\nRoblox ID: **${userId}**`)
          .setFooter({ text: 'Check console logs for detailed error information.' });
        return await interaction.editReply({ embeds: [embed] });
      }

      // Registration successful
      const embed = new EmbedBuilder()
        .setColor(0x00AAFF)
        .setTitle('✅ Roblox ID Linked')
        .setDescription(`Your Discord is now linked with Roblox ID **${userId}**.\n${userExists ? `Your current balance: **${currentBalance}**` : 'Starting balance: **0**'}\n\nYou can now use \`/bal\`.`)
        .setFooter({ text: 'You can re-register at any time.' });

      await interaction.editReply({ embeds: [embed] });
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error('❌ Stack:', err.stack);

    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('❌ An error occurred')
      .setDescription(`\`\`\`${err.message}\`\`\``)
      .setFooter({ text: 'Please try again later or contact support.' });

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ embeds: [embed] });
    } else {
      await interaction.reply({ embeds: [embed] });
    }
  }
});

client.once('ready', () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
  registerCommands();
});

const web = express();
web.get('/', (_, res) => res.send('🤖 Bot is running!'));
web.listen(8080, () => console.log('🌐 Web server running on port 8080'));

client.login(TOKEN);
