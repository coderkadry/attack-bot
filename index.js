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
import fs from 'fs';
import path from 'path';

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = '1386338165916438538';
const GUILD_ID = '1380367982986793010';
const API_BASE = 'https://attack-roblox-api-135053415446.europe-west3.run.app';

// Local storage for Discord-Roblox links (since API doesn't have registration)
const LINKS_FILE = './discord_links.json';

// Load existing links
let discordLinks = {};
try {
  if (fs.existsSync(LINKS_FILE)) {
    discordLinks = JSON.parse(fs.readFileSync(LINKS_FILE, 'utf8'));
  }
} catch (err) {
  console.log('Creating new links file...');
  discordLinks = {};
}

// Save links to file
function saveLinks() {
  try {
    fs.writeFileSync(LINKS_FILE, JSON.stringify(discordLinks, null, 2));
  } catch (err) {
    console.error('Failed to save links:', err.message);
  }
}

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

  new SlashCommandBuilder()
    .setName('debug')
    .setDescription('🔧 Debug API endpoints'),
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
      
      // Check local links first
      const linkedRobloxId = discordLinks[discordId];
      
      if (!linkedRobloxId) {
        const embed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('❌ You are not registered')
          .setDescription('Use `/register <your_roblox_id>` to link your Roblox account first.');
        return await interaction.editReply({ embeds: [embed] });
      }

      console.log(`🎮 Found linked Roblox ID: ${linkedRobloxId}`);

      // Get balance from API
      const balRes = await fetch(`${API_BASE}/get-balance/${linkedRobloxId}`);
      const balText = await balRes.text();
      
      console.log(`💰 Balance API Response: ${balRes.status} - ${balText}`);

      if (!balRes.ok) {
        if (balRes.status === 404) {
          const embed = new EmbedBuilder()
            .setColor(0xFFAA00)
            .setTitle('⚠️ User not found in system')
            .setDescription(`Your linked Roblox ID **${linkedRobloxId}** was not found in the balance system.\n\nThis means you're registered locally but don't have a balance record yet.\n\n**Starting Balance: 0**`)
            .setFooter({ text: 'Contact an admin to add you to the balance system.' });
          return await interaction.editReply({ embeds: [embed] });
        }
        throw new Error(`Balance API error: ${balRes.status} - ${balText}`);
      }

      const balData = JSON.parse(balText);
      if (typeof balData.balance !== 'number') {
        throw new Error(`Invalid balance response: ${balText}`);
      }

      const embed = new EmbedBuilder()
        .setColor(0x00FF99)
        .setTitle('💰 Your Balance')
        .setDescription(`**Roblox ID:** ${linkedRobloxId}\n**Balance:** ${balData.balance}`)
        .setFooter({ text: 'Powered by Attack Roblox' });

      await interaction.editReply({ embeds: [embed] });
    }

    if (command === 'debug') {
      console.log('🔧 Running API debug...');
      
      const debugResults = [];
      
      // Test 1: Check if API base is reachable
      try {
        const healthRes = await fetch(`${API_BASE}/`);
        debugResults.push(`✅ API Base reachable: ${healthRes.status}`);
      } catch (err) {
        debugResults.push(`❌ API Base unreachable: ${err.message}`);
      }
      
      // Test 2: Check available endpoints (these are the ones from your original code's debug)
      const testEndpoints = [
        '/register', // These are likely NOT active or properly implemented on your API
        '/link',     // These are likely NOT active or properly implemented on your API
        '/create-user', // These are likely NOT active or properly implemented on your API
        '/add-user',    // These are likely NOT active or properly implemented on your API
        '/users',
        '/health',
        '/status',
        '/get-balance/123' // Example for get-balance
      ];
      
      for (const endpoint of testEndpoints) {
        try {
          const testRes = await fetch(`${API_BASE}${endpoint}`, {
            method: 'GET'
          });
          debugResults.push(`📡 GET ${endpoint}: ${testRes.status}`);
        } catch (err) {
          debugResults.push(`❌ GET ${endpoint}: ${err.message}`);
        }
      }
      
      // Test 3: Try POST to different endpoints (these are the ones from your original code's debug)
      const testData = { discordId: '123', robloxId: '456' };
      for (const endpoint of ['/register', '/link', '/create-user', '/add-user']) { // Added '/add-user' here for completeness
        try {
          const testRes = await fetch(`${API_BASE}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(testData)
          });
          const responseText = await testRes.text();
          debugResults.push(`📤 POST ${endpoint}: ${testRes.status} - ${responseText.substring(0, 100)}`);
        } catch (err) {
          debugResults.push(`❌ POST ${endpoint}: ${err.message}`);
        }
      }
      
      const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('🔧 API Debug Results')
        .setDescription(`\`\`\`${debugResults.join('\n')}\`\`\``)
        .setFooter({ text: 'Check console for full details' });
        
      console.log('🔧 Debug Results:', debugResults);
      await interaction.editReply({ embeds: [embed] });
    }

    if (command === 'register') {
      const userId = interaction.options.getString('userid');
      
      console.log(`📝 Registering Discord ID: ${discordId} with Roblox ID: ${userId}`);

      // Validate Roblox ID format (should be numbers only)
      if (!/^\d+$/.test(userId)) {
        const embed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('❌ Invalid Roblox ID')
          .setDescription('Roblox ID should contain only numbers.\n\nExample: `5818937005`')
          .setFooter({ text: 'Make sure to use your Roblox User ID, not username.' });
        return await interaction.editReply({ embeds: [embed] });
      }

      // Store the link locally
      discordLinks[discordId] = userId;
      saveLinks();
      
      console.log(`✅ Successfully linked Discord ${discordId} to Roblox ${userId} locally.`);

      let userExistsInSystem = false;
      let currentBalance = 0;
      let apiRegistrationMessage = "";

      // **NEW STEP: Attempt to register/ensure user in API balance system**
      try {
        const ensureUserRes = await fetch(`${API_BASE}/ensure-user-balance`, { // <--- Call your new API endpoint
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ robloxId: userId })
        });

        const ensureUserText = await ensureUserRes.text();
        console.log(`API ensure-user-balance response: ${ensureUserRes.status} - ${ensureUserText}`);

        if (ensureUserRes.ok) {
            const ensureUserData = JSON.parse(ensureUserText);
            userExistsInSystem = true;
            currentBalance = ensureUserData.balance || 0;
            apiRegistrationMessage = ensureUserData.message || "User status updated in API.";
        } else {
            apiRegistrationMessage = `Failed to update user status in API: ${ensureUserRes.status} - ${ensureUserText.substring(0, 100)}`;
            console.error(`API ensure-user-balance error: ${apiRegistrationMessage}`);
        }
      } catch (err) {
        apiRegistrationMessage = `Error contacting API for user balance system: ${err.message}`;
        console.error(`Error contacting API for ensure-user-balance: ${err.message}`);
      }

      const embed = new EmbedBuilder()
        .setColor(0x00AAFF)
        .setTitle('✅ Registration Successful!')
        .setDescription(
          `Your Discord account has been linked to Roblox ID: **${userId}**\n\n` +
          (userExistsInSystem ?
            `🎉 **Current Balance:** ${currentBalance}\n*${apiRegistrationMessage}*` :
            `⚠️ **Status:** Not in balance system yet (or initial creation failed)\n**Starting Balance:** 0\n\n*${apiRegistrationMessage}*`
          ) +
          `\n\nYou can now use \`/bal\` to check your balance!`
        )
        .setFooter({ text: 'You can re-register anytime to change your linked ID.' });

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

