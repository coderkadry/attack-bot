const dotenv = require('dotenv');
dotenv.config();

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

// ... (rest of your imports and setup)

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = '1386338165916438538';
const API_BASE = 'https://attack-roblox-api-135053415446.europe-west3.run.app';
const ROBLOX_API_KEY = process.env.ROBLOX_API_KEY; // <<< ADD THIS if your API needs an API key

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
    .setName('pay')
    .setDescription('💸 Pay Robux to another Roblox user')
    .addStringOption(option =>
      option.setName('userid')
        .setDescription('Recipient Roblox UserId')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('Amount to pay')
        .setRequired(true)
        .setMinValue(1)
    ),

  new SlashCommandBuilder()
    .setName('debug')
    .setDescription('🔧 Debug API endpoints'),
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

async function registerGlobalCommands() {
  try {
    console.log('📦 Registering global commands...');
    console.log('🔧 Commands to register:', commands.map(cmd => cmd.name));
    
    const result = await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands }
    );
    
    console.log('✅ Global slash commands registered successfully!');
    console.log('📋 Registered commands:', result.map(cmd => cmd.name));
  } catch (err) {
    console.error('❌ Global command registration failed:', err.message);
    console.error('❌ Full error:', err);
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
            .setDescription(`Your linked Roblox ID **${linkedRobloxId}** was not found in the balance system.\n\nContact an admin to add you to the balance system.`)
            .setFooter({ text: 'Starting Balance: 0' });
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

    if (command === 'pay') {
      console.log(`💸 Pay command initiated by Discord ID: ${discordId}`);
      
      // Check if user is registered
      const senderRobloxId = discordLinks[discordId];
      
      if (!senderRobloxId) {
        const embed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('❌ You are not registered')
          .setDescription('Use `/register <your_roblox_id>` to link your Roblox account first.');
        return await interaction.editReply({ embeds: [embed] });
      }

      const recipientUserId = interaction.options.getString('userid');
      const amount = interaction.options.getInteger('amount');

      // Validate recipient Roblox ID format
      if (!/^\d+$/.test(recipientUserId)) {
        const embed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('❌ Invalid Recipient Roblox ID')
          .setDescription('Roblox ID should contain only numbers.\n\nExample: `5818937005`');
        return await interaction.editReply({ embeds: [embed] });
      }

      // Check if trying to pay themselves
      if (senderRobloxId === recipientUserId) {
        const embed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('❌ Cannot pay yourself')
          .setDescription('You cannot send money to your own account.');
        return await interaction.editReply({ embeds: [embed] });
      }

      console.log(`💸 Processing payment: ${senderRobloxId} -> ${recipientUserId} (${amount})`);

      // --- START MODIFICATION AREA (Based on your API's requirements) ---
      // This section needs to be updated based on your actual API's payment endpoint and payload.

      let paymentSuccessful = false;
      let apiErrorDetails = ''; // To store specific error from the API

      // EXAMPLE: Assuming your API has ONE specific endpoint like '/process-payment'
      // and expects 'senderId', 'recipientId', and 'robuxAmount' as JSON.
      // Also assuming it requires an 'X-API-KEY' header.
      const CORRECT_PAYMENT_ENDPOINT = `${API_BASE}/process-payment`; // <<< UPDATE THIS
      const PAYMENT_METHOD = 'POST'; // <<< UPDATE THIS if different

      try {
        console.log(`💸 Attempting payment via: ${CORRECT_PAYMENT_ENDPOINT}`);
        
        const payRes = await fetch(CORRECT_PAYMENT_ENDPOINT, {
          method: PAYMENT_METHOD,
          headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': ROBLOX_API_KEY // <<< ADD THIS if your API requires an API key
          },
          body: JSON.stringify({
            // <<< UPDATE THESE FIELD NAMES AND STRUCTURE based on your API's requirements
            senderId: senderRobloxId,
            recipientId: recipientUserId,
            robuxAmount: amount
          })
        });

        const payText = await payRes.text();
        console.log(`💸 ${CORRECT_PAYMENT_ENDPOINT} Response: ${payRes.status} - ${payText}`);

        if (payRes.ok) {
          console.log(`✅ Payment successful via ${CORRECT_PAYMENT_ENDPOINT}`);
          paymentSuccessful = true;
          
          const embed = new EmbedBuilder()
            .setColor(0x00FF99)
            .setTitle('✅ Payment Successful!')
            .setDescription(
              `**Amount:** ${amount}\n` +
              `**To:** ${recipientUserId}\n` +
              `**From:** ${senderRobloxId}\n\n` +
              `Transaction completed successfully!`
            )
            .setFooter({ text: 'Use /bal to check your updated balance.' });

          await interaction.editReply({ embeds: [embed] });
        } else {
          apiErrorDetails = `API returned error: ${payRes.status} - ${payText}`;
          console.error(`❌ Payment failed via ${CORRECT_PAYMENT_ENDPOINT}: ${apiErrorDetails}`);
          
          // You can add more specific error handling here based on API status codes or error messages
          if (payRes.status === 400 && payText.includes("INSUFFICIENT_FUNDS")) { // Example of parsing API response
            apiErrorDetails = 'Insufficient funds for this transaction.';
          } else if (payRes.status === 404 && payText.includes("RECIPIENT_NOT_FOUND")) {
            apiErrorDetails = 'Recipient Roblox ID not found in the payment system.';
          }
        }
      } catch (err) {
        console.log(`❌ Error connecting to payment API: ${err.message}`);
        apiErrorDetails = `Network/Connection Error: ${err.message}`;
      }

      if (!paymentSuccessful) {
        console.error('💸 Payment failed. Details:', apiErrorDetails);
        
        const embed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('❌ Payment Failed')
          .setDescription(
            `Unable to process payment.\n\n` +
            `**Attempted Amount:** ${amount}\n` +
            `**To:** ${recipientUserId}\n` +
            `**From:** ${senderRobloxId}\n\n` +
            `**Reason:** ${apiErrorDetails || 'The payment system may not be available or encountered an unexpected error.'}\n\n` +
            `Please contact an administrator to process this payment manually or investigate the API.`
          );
        
        await interaction.editReply({ embeds: [embed] });
      }
      // --- END MODIFICATION AREA ---
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
      
      // Test 2: Check available endpoints
      const testEndpoints = [
        '/users',
        '/health',
        '/status',
        '/get-balance/123',
        // Add your actual payment endpoint here for a test call (e.g., `/process-payment`)
        `${CORRECT_PAYMENT_ENDPOINT} (POST, dummy data)`
      ];
      
      for (const endpoint of testEndpoints) {
        try {
            // For POST endpoints, you might need to send a minimal valid body for a proper test
            let options = { method: 'GET' };
            if (endpoint.includes('(POST, dummy data)')) {
                options = {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...(ROBLOX_API_KEY && {'X-API-KEY': ROBLOX_API_KEY}) },
                    body: JSON.stringify({ senderId: '1', recipientId: '2', robuxAmount: 1 })
                };
            }
          const testRes = await fetch(`${API_BASE}${endpoint.split(' ')[0]}`, options);
          debugResults.push(`📡 ${endpoint}: ${testRes.status}`);
        } catch (err) {
          debugResults.push(`❌ ${endpoint}: ${err.message}`);
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

      const embed = new EmbedBuilder()
        .setColor(0x00AAFF)
        .setTitle('✅ Registration Successful!')
        .setDescription(
          `Your Discord account has been linked to Roblox ID: **${userId}**\n\n` +
          `You can now use \`/bal\` to check your balance!`
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

client.once('ready', async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
  console.log(`🌐 Bot is active in ${client.guilds.cache.size} servers`);
  
  // Wait a moment for the client to be fully ready
  setTimeout(async () => {
    await registerGlobalCommands();
    
    // Also clear any existing guild-specific commands that might be interfering
    console.log('🧹 Clearing any old guild-specific commands...');
    for (const guild of client.guilds.cache.values()) {
      try {
        await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guild.id), { body: [] });
        console.log(`✅ Cleared guild commands for ${guild.name}`);
      } catch (err) {
        console.log(`⚠️ Could not clear guild commands for ${guild.name}: ${err.message}`);
      }
    }
    
    console.log('🎉 Bot setup complete! Commands should be available globally in 1-5 minutes.');
  }, 2000);
});

// Handle guild join events
client.on('guildCreate', guild => {
  console.log(`🎉 Joined new server: ${guild.name} (${guild.id})`);
});

client.on('guildDelete', guild => {
  console.log(`👋 Left server: ${guild.name} (${guild.id})`);
});

const web = express();
web.get('/', (_, res) => res.send('🤖 Bot is running globally!'));
web.get('/stats', (_, res) => {
  res.json({
    servers: client.guilds.cache.size,
    users: client.users.cache.size,
    uptime: process.uptime(),
    registeredUsers: Object.keys(discordLinks).length
  });
});
web.listen(8080, () => console.log('🌐 Web server running on port 8080'));

client.login(TOKEN);
