import dotenv from 'dotenv';
dotenv.config(); // Load environment variables from .env file

import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
} from 'discord.js';
import express from 'express';
import fetch from 'node-fetch'; // For making HTTP requests to external APIs
import fs from 'fs';
import path from 'path';

// --- Configuration ---
const TOKEN = process.env.DISCORD_TOKEN; // Your Discord Bot Token from .env
const CLIENT_ID = '1386338165916438538'; // Your Discord Bot's Client ID (hardcoded as per your original code)
const API_BASE = 'https://attack-roblox-api-135053415446.europe-west3.run.app'; // The base URL for your external Roblox API

// Important: These are configured based on your provided context and external API usage
const ROBLOX_PAYMENT_ENDPOINT_PATH = '/update-balance';
const ROBLOX_PAYMENT_HTTP_METHOD = 'POST';

// If your Roblox API requires an API key, uncomment and set this in your .env file
// const ROBLOX_API_KEY = process.env.ROBLOX_API_KEY;

// --- Local Storage for Discord-Roblox Links ---
// This stores links between Discord IDs and Roblox User IDs in a local JSON file.
const LINKS_FILE = './discord_links.json';
let discordLinks = {};

// Load existing links from file on startup
function loadLinks() {
  try {
    if (fs.existsSync(LINKS_FILE)) {
      discordLinks = JSON.parse(fs.readFileSync(LINKS_FILE, 'utf8'));
      console.log(`🔗 Loaded ${Object.keys(discordLinks).length} Discord-Roblox links.`);
    } else {
      console.log('Creating new links file as it does not exist...');
      discordLinks = {}; // Initialize as empty object if file doesn't exist
    }
  } catch (err) {
    console.error('❌ Failed to load links file, starting fresh:', err.message);
    discordLinks = {}; // Fallback to empty if parsing fails
  }
}
loadLinks(); // Call loadLinks immediately on script start

// Save current links to file
function saveLinks() {
  try {
    fs.writeFileSync(LINKS_FILE, JSON.stringify(discordLinks, null, 2));
    console.log('🔗 Discord-Roblox links saved successfully.');
  } catch (err) {
    console.error('❌ Failed to save links:', err.message);
  }
}

// --- Discord Client Setup ---
const client = new Client({
  intents: [GatewayIntentBits.Guilds], // Required for guild-related events like slash commands
});

// --- Slash Command Definitions ---
// Define all the slash commands for your bot.
const commands = [
  new SlashCommandBuilder()
    .setName('bal')
    .setDescription('💰 Show your registered Roblox balance'),

  new SlashCommandBuilder()
    .setName('register')
    .setDescription('🔗 Link or change your Roblox ID')
    .addStringOption(option =>
      option.setName('userid')
        .setDescription('Your Roblox UserId (e.g., 123456789)')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('pay')
    .setDescription('💸 Pay Robux to another Roblox user')
    .addStringOption(option =>
      option.setName('userid')
        .setDescription('Recipient Roblox UserId (e.g., 987654321)')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('Amount to pay (must be at least 1)')
        .setRequired(true)
        .setMinValue(1)
    ),

  new SlashCommandBuilder()
    .setName('debug')
    .setDescription('🔧 Debug API endpoints and bot status'),
].map(cmd => cmd.toJSON()); // Convert command builders to JSON for Discord API

const rest = new REST({ version: '10' }).setToken(TOKEN); // REST API for Discord interactions

// --- Function to Register Global Slash Commands ---
async function registerGlobalCommands() {
  try {
    console.log('📦 Registering global slash commands...');
    console.log('🔧 Commands to register:', commands.map(cmd => cmd.name));

    // Register commands globally (takes 1-5 minutes to propagate)
    const result = await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands }
    );

    console.log('✅ Global slash commands registered successfully!');
    console.log('📋 Registered commands:', result.map(cmd => cmd.name));
  } catch (err) {
    console.error('❌ Global command registration failed:', err.message);
    console.error('❌ Full error details:', err);
  }
}

// --- Interaction Handling ---
// This is the main event listener for all slash command interactions.
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return; // Only process chat input commands

  const command = interaction.commandName;
  const discordId = interaction.user.id;

  try {
    await interaction.deferReply(); // Acknowledge the command quickly to prevent "Interaction failed"

    // --- '/bal' Command: Check Roblox Balance ---
    if (command === 'bal') {
      console.log(`🔍 Checking balance for Discord ID: ${discordId}`);

      const linkedRobloxId = discordLinks[discordId];

      if (!linkedRobloxId) {
        const embed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('❌ You are not registered')
          .setDescription('Use `/register <your_roblox_id>` to link your Roblox account first.');
        return await interaction.editReply({ embeds: [embed] });
      }

      console.log(`🎮 Found linked Roblox ID: ${linkedRobloxId}`);

      // Fetch balance from your Roblox API
      const balRes = await fetch(`${API_BASE}/get-balance/${linkedRobloxId}`);
      const balText = await balRes.text(); // Get raw text to handle non-JSON errors

      console.log(`💰 Balance API Response: ${balRes.status} - ${balText}`);

      if (!balRes.ok) {
        if (balRes.status === 404) {
          // Specific handling for user not found in the balance system
          const embed = new EmbedBuilder()
            .setColor(0xFFAA00)
            .setTitle('⚠️ User not found in system')
            .setDescription(`Your linked Roblox ID **${linkedRobloxId}** was not found in the balance system.\n\nContact an admin to add you to the balance system.`)
            .setFooter({ text: 'Starting Balance: 0 (Assumed)' }); // Assumed initial state
          return await interaction.editReply({ embeds: [embed] });
        }
        // For other API errors, throw an error to be caught by the general catch block
        throw new Error(`Balance API error: ${balRes.status} - ${balText}`);
      }

      const balData = JSON.parse(balText); // Parse response if it's OK
      if (typeof balData.balance !== 'number') {
        throw new Error(`Invalid balance response format: ${balText}`);
      }

      const embed = new EmbedBuilder()
        .setColor(0x00FF99)
        .setTitle('💰 Your Balance')
        .setDescription(`**Roblox ID:** ${linkedRobloxId}\n**Balance:** ${balData.balance}`)
        .setFooter({ text: 'Powered by Attack Roblox' });

      await interaction.editReply({ embeds: [embed] });
    }

    // --- '/pay' Command: Transfer Robux ---
    if (command === 'pay') {
      console.log(`💸 Pay command initiated by Discord ID: ${discordId}`);

      // Ensure sender is registered
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

      // Validate recipient Roblox ID format (numbers only)
      if (!/^\d+$/.test(recipientUserId)) {
        const embed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('❌ Invalid Recipient Roblox ID')
          .setDescription('Roblox ID should contain only numbers.\n\nExample: `5818937005`');
        return await interaction.editReply({ embeds: [embed] });
      }

      // Prevent self-payment
      if (senderRobloxId === recipientUserId) {
        const embed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('❌ Cannot pay yourself')
          .setDescription('You cannot send money to your own account.');
        return await interaction.editReply({ embeds: [embed] });
      }

      console.log(`💸 Initiating payment transaction: From ${senderRobloxId} to ${recipientUserId} Amount: ${amount}`);

      let apiErrorDetails = ''; // To store specific error message from the API
      let originalSenderBalance = 0; // To store sender's balance before deduction for rollback

      try {
        // Step 1: Get sender's current balance
        console.log(`🔍 Fetching sender's balance (${senderRobloxId})...`);
        const senderBalRes = await fetch(`${API_BASE}/get-balance/${senderRobloxId}`);
        const senderBalText = await senderBalRes.text();
        if (!senderBalRes.ok) {
          throw new Error(`Failed to retrieve sender's balance: ${senderBalRes.status} - ${senderBalText}`);
        }
        const senderBalData = JSON.parse(senderBalText);
        if (typeof senderBalData.balance !== 'number') {
          throw new Error(`Invalid balance format for sender: ${senderBalText}`);
        }
        originalSenderBalance = senderBalData.balance;
        console.log(`Sender ${senderRobloxId} current balance: ${originalSenderBalance}`);

        // Step 2: Check for sufficient funds
        if (originalSenderBalance < amount) {
          const embed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('❌ Payment Failed: Insufficient Funds')
            .setDescription(`You only have **${originalSenderBalance} Robux**, but you are trying to pay **${amount} Robux**. You need more funds.`);
          return await interaction.editReply({ embeds: [embed] });
        }

        // Step 3: Get recipient's current balance (or assume 0 if not found)
        console.log(`🔍 Fetching recipient's balance (${recipientUserId})...`);
        let recipientCurrentBalance = 0;
        const recipientBalRes = await fetch(`${API_BASE}/get-balance/${recipientUserId}`);
        const recipientBalText = await recipientBalRes.text();

        if (!recipientBalRes.ok) {
          if (recipientBalRes.status === 404) {
            // Recipient not found in system, assume 0 balance and proceed
            console.log(`Recipient ${recipientUserId} not found, assuming initial balance of 0.`);
            recipientCurrentBalance = 0;
          } else {
            // Other API errors for recipient balance are critical
            throw new Error(`Failed to retrieve recipient's balance: ${recipientBalRes.status} - ${recipientBalText}`);
          }
        } else {
          const recipientBalData = JSON.parse(recipientBalText);
          if (typeof recipientBalData.balance !== 'number') {
            throw new Error(`Invalid balance format for recipient: ${recipientBalText}`);
          }
          recipientCurrentBalance = recipientBalData.balance;
        }
        console.log(`Recipient ${recipientUserId} current balance: ${recipientCurrentBalance}`);


        // Step 4: Calculate new balances
        const newSenderBalance = originalSenderBalance - amount;
        const newRecipientBalance = recipientCurrentBalance + amount;

        // Step 5a: Deduct from sender's balance
        console.log(`💸 Attempting to deduct ${amount} from ${senderRobloxId}. New balance: ${newSenderBalance}`);
        const senderUpdateRes = await fetch(`${API_BASE}${ROBLOX_PAYMENT_ENDPOINT_PATH}`, {
          method: ROBLOX_PAYMENT_HTTP_METHOD,
          headers: {
            'Content-Type': 'application/json',
            // ...(ROBLOX_API_KEY && { 'X-API-KEY': ROBLOX_API_KEY }) // Uncomment if your API requires an API Key
          },
          body: JSON.stringify({
            userId: senderRobloxId,
            balance: newSenderBalance,
          })
        });

        const senderUpdateText = await senderUpdateRes.text();
        console.log(`💸 Sender update response: ${senderUpdateRes.status} - ${senderUpdateText}`);

        if (!senderUpdateRes.ok) {
          throw new Error(`Failed to deduct from sender: ${senderUpdateRes.status} - ${senderUpdateText}`);
        }

        // Step 5b: Add to recipient's balance
        console.log(`💸 Attempting to add ${amount} to ${recipientUserId}. New balance: ${newRecipientBalance}`);
        const recipientUpdateRes = await fetch(`${API_BASE}${ROBLOX_PAYMENT_ENDPOINT_PATH}`, {
          method: ROBLOX_PAYMENT_HTTP_METHOD,
          headers: {
            'Content-Type': 'application/json',
            // ...(ROBLOX_API_KEY && { 'X-API-KEY': ROBLOX_API_KEY }) // Uncomment if your API requires an API Key
          },
          body: JSON.stringify({
            userId: recipientUserId,
            balance: newRecipientBalance,
          })
        });

        const recipientUpdateText = await recipientUpdateRes.text();
        console.log(`💸 Recipient update response: ${recipientUpdateRes.status} - ${recipientUpdateText}`);

        if (!recipientUpdateRes.ok) {
          // If recipient update fails, attempt to rollback sender's deduction (best effort)
          apiErrorDetails = `Failed to add to recipient: ${recipientUpdateRes.status} - ${recipientUpdateText}`;
          console.error(`Recipient update failed. Attempting to rollback sender ${senderRobloxId} balance to ${originalSenderBalance}`);
          await fetch(`${API_BASE}${ROBLOX_PAYMENT_ENDPOINT_PATH}`, {
            method: ROBLOX_PAYMENT_HTTP_METHOD,
            headers: {
              'Content-Type': 'application/json',
              // ...(ROBLOX_API_KEY && { 'X-API-KEY': ROBLOX_API_KEY }) // Uncomment if your API requires an API Key
            },
            body: JSON.stringify({
              userId: senderRobloxId,
              balance: originalSenderBalance, // Revert to original balance
            })
          }).then(res => console.log(`Rollback attempt for sender: ${res.status}`))
            .catch(err => console.error(`Rollback FAILED for sender: ${err.message}`));

          throw new Error(apiErrorDetails); // Throw original error
        }

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

      } catch (err) {
        // This catches any errors during balance checks or API update calls
        console.error(`❌ Payment transaction failed: ${err.message}`);
        apiErrorDetails = err.message;

        // Construct detailed error embed
        const embed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('❌ Payment Failed')
          .setDescription(
            `Unable to process payment.\n\n` +
            `**Attempted Amount:** ${amount}\n` +
            `**To:** ${recipientUserId}\n` +
            `**From:** ${senderRobloxId}\n\n` +
            `**Reason:** ${apiErrorDetails || 'An unexpected error occurred during the transaction.'}\n\n` +
            `Please contact an administrator to process this payment manually or investigate the API.`
          )
          .setFooter({ text: `API Endpoint used: ${API_BASE}${ROBLOX_PAYMENT_ENDPOINT_PATH}` });

        await interaction.editReply({ embeds: [embed] });
      }
    }

    // --- '/debug' Command: Test API Endpoints ---
    if (command === 'debug') {
      console.log('🔧 Running API debug...');

      const debugResults = [];

      // Test 1: Check if API base is reachable (using a generic root or health endpoint if available)
      try {
        const healthRes = await fetch(`${API_BASE}/`); // Or a specific health endpoint like /health
        debugResults.push(`✅ API Base reachable: ${healthRes.status}`);
      } catch (err) {
        debugResults.push(`❌ API Base unreachable: ${err.message}`);
      }

      // Test 2: Check known endpoints
      const testEndpoints = [
        // { path: '/users', method: 'GET' }, // Uncomment if your API has these
        // { path: '/health', method: 'GET' },
        // { path: '/status', method: 'GET' },
        { path: '/get-balance/123', method: 'GET' }, // Test a dummy balance lookup
        // --- Add your actual payment endpoint here for a test call ---
        { path: ROBLOX_PAYMENT_ENDPOINT_PATH, method: ROBLOX_PAYMENT_HTTP_METHOD, testBody: { userId: '1', balance: 100 } } // Example body for update-balance
      ];

      for (const endpoint of testEndpoints) {
        try {
          let fetchOptions = { method: endpoint.method };
          if (endpoint.method === 'POST' && endpoint.testBody) {
            fetchOptions.headers = { 'Content-Type': 'application/json' };
            // If you added ROBLOX_API_KEY, uncomment these:
            // ...(ROBLOX_API_KEY && { 'X-API-KEY': ROBLOX_API_KEY })
            fetchOptions.body = JSON.stringify(endpoint.testBody);
          }
          const testRes = await fetch(`${API_BASE}${endpoint.path}`, fetchOptions);
          debugResults.push(`📡 ${endpoint.method} ${endpoint.path}: ${testRes.status}`);
        } catch (err) {
          debugResults.push(`❌ ${endpoint.method} ${endpoint.path}: ${err.message}`);
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

    // --- '/register' Command: Link Roblox ID ---
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
    // --- Global Error Handling for Interactions ---
    console.error('❌ An unhandled error occurred during interaction:', err.message);
    console.error('❌ Error Stack:', err.stack);

    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('❌ An unexpected error occurred')
      .setDescription(`Something went wrong while processing your command.\n\`\`\`${err.message}\`\`\``)
      .setFooter({ text: 'Please try again later or contact support if the issue persists.' });

    // Check if reply was already deferred or sent to avoid crashes
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ embeds: [embed] });
    } else {
      await interaction.reply({ embeds: [embed] });
    }
  }
});

// --- Bot Ready Event ---
// This runs once when the bot successfully connects to Discord.
client.once('ready', async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
  console.log(`🌐 Bot is active in ${client.guilds.cache.size} servers`);

  // Give Discord a moment to fully process bot's presence before registering commands.
  setTimeout(async () => {
    await registerGlobalCommands(); // Register slash commands

    // Optionally clear old guild-specific commands to prevent conflicts.
    // This ensures only global commands are active.
    console.log('🧹 Clearing any old guild-specific commands (if present)...');
    for (const guild of client.guilds.cache.values()) {
      try {
        await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guild.id), { body: [] });
        console.log(`✅ Cleared guild commands for ${guild.name}`);
      } catch (err) {
        console.log(`⚠️ Could not clear guild commands for ${guild.name}: ${err.message}`);
      }
    }

    console.log('🎉 Bot setup complete! Commands should be available globally in 1-5 minutes.');
  }, 2000); // 2-second delay
});

// --- Guild Join/Leave Events (for logging purposes) ---
client.on('guildCreate', guild => {
  console.log(`🎉 Joined new server: ${guild.name} (${guild.id})`);
});

client.on('guildDelete', guild => {
  console.log(`👋 Left server: ${guild.name} (${guild.id})`);
});

// --- Web Server for Health Check / Stats ---
// This Express server provides a basic endpoint to check if the bot's process is running.
const web = express();
web.get('/', (_, res) => res.send('🤖 Attack Roblox Discord Bot is running globally!'));
web.get('/stats', (_, res) => {
  res.json({
    servers: client.guilds.cache.size,
    users: client.users.cache.size,
    uptime: process.uptime(),
    registeredUsers: Object.keys(discordLinks).length
  });
});
const PORT = process.env.PORT || 8080; // Use environment variable PORT or default to 8080
web.listen(PORT, () => console.log(`🌐 Web server running on port ${PORT}`));

// --- Log in to Discord ---
client.login(TOKEN).catch(err => {
  console.error('❌ Failed to log in to Discord. Check your DISCORD_TOKEN in .env file!');
  console.error('Error:', err.message);
  process.exit(1); // Exit the process if login fails
});
