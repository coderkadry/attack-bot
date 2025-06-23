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
import fs from 'fs';
import path from 'path';

// --- Firebase Imports for Google Cloud Firestore ---
// We now use firebase-admin for server-side authentication
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore'; // Use Firestore from firebase-admin

// --- Configuration ---
const TOKEN = process.env.DISCORD_TOKEN; // Your Discord Bot Token from .env
const CLIENT_ID = '1386338165916438538'; // Your Discord Bot's Client ID (hardcoded as per your original code)

// --- Firebase/Firestore Service Account Key (for production environment) ---
// The path to your service account key file relative to where your bot runs.
// Recommended to store this file securely outside your git repository.
// You'll upload this to your Google Cloud VM.
const SERVICE_ACCOUNT_KEY_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH || './serviceAccountKey.json'; // Default path

let db; // Firestore instance
let authReady = false; // Flag to indicate if Firebase Admin SDK is initialized

// --- Initialize Firebase Admin SDK for server-side access ---
async function initializeFirebaseAdminSDK() {
  try {
    // Read the service account key from the specified path
    console.log(`Attempting to read service account key from: ${SERVICE_ACCOUNT_KEY_PATH}`);
    const serviceAccountContent = fs.readFileSync(SERVICE_ACCOUNT_KEY_PATH, 'utf8');
    const serviceAccount = JSON.parse(serviceAccountContent);

    // --- IMPORTANT DEBUGGING STEP ---
    // Log the project_id from the service account key to confirm it's there
    console.log(`Service Account Project ID found: ${serviceAccount.project_id}`);
    if (!serviceAccount.project_id) {
        throw new Error('Project ID is missing from the service account key file. Please ensure you downloaded the correct JSON key.');
    }

    // Initialize Firebase Admin SDK, explicitly providing the projectId from the service account
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id, // Explicitly provide projectId from the key
      // databaseURL: "https://<YOUR_PROJECT_ID>.firebaseio.com" // Only needed for Realtime Database
    });

    db = getFirestore(); // Get Firestore instance from the initialized admin app
    authReady = true;
    console.log('✅ Firebase Admin SDK initialized and Firestore connected.');
  } catch (error) {
    console.error('❌ Failed to initialize Firebase Admin SDK or connect to Firestore:', error.message);
    console.error(`Please verify:`);
    console.error(`1. The file "${SERVICE_ACCOUNT_KEY_PATH}" exists on your Google Cloud VM.`);
    console.error(`2. The contents of "${SERVICE_ACCOUNT_KEY_PATH}" are a valid JSON for a Firebase service account key.`);
    console.error(`3. That JSON file contains a field named "project_id".`);
    // If it fails, db will remain undefined and authReady will be false.
  }
}

// Call the initialization function
initializeFirebaseAdminSDK();


// --- Local Storage for Discord-Roblox Links (Still local file-based) ---
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
    .setDescription('🔧 Debug bot status and Firestore connection'),
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

// --- Firestore Helper Functions ---
// Gets a player's balance from Firestore. Returns 0 if user not found.
async function getPlayerBalanceFromFirestore(robloxId) {
  if (!db) {
    console.error("Firestore DB instance not available.");
    return 0;
  }
  // Use serviceAccount.project_id directly, as it's now explicitly provided during init.
  // We can also rely on the admin SDK's default project if only one is initialized.
  const projectId = admin.app().options.projectId; // Get the project ID from the initialized app
  const balanceDocRef = db.collection(`artifacts/${projectId}/public/data/roblox-balances`).doc(String(robloxId));
  const balanceDocSnap = await balanceDocRef.get();
  if (balanceDocSnap.exists) {
    const data = balanceDocSnap.data();
    return typeof data.balance === 'number' ? data.balance : 0;
  }
  return 0; // User not found in Firestore, assume 0 balance
}

// Updates a player's balance in Firestore. Creates document if it doesn't exist.
async function updatePlayerBalanceInFirestore(robloxId, newBalance) {
  if (!db) {
    console.error("Firestore DB instance not available.");
    return;
  }
  const projectId = admin.app().options.projectId; // Get the project ID from the initialized app
  const balanceDocRef = db.collection(`artifacts/${projectId}/public/data/roblox-balances`).doc(String(robloxId));
  await balanceDocRef.set({ balance: newBalance }, { merge: true }); // Use merge to avoid overwriting other fields if any
}

// --- Interaction Handling ---
// This is the main event listener for all slash command interactions.
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return; // Only process chat input commands

  const command = interaction.commandName;
  const discordId = interaction.user.id;

  // Ensure Firestore Admin SDK is initialized before processing commands that interact with it
  if (!authReady || !db) { // Check our authReady flag instead of auth.currentUser
    await interaction.deferReply();
    const embed = new EmbedBuilder()
      .setColor(0xFF8C00)
      .setTitle('⚠️ Bot initializing')
      .setDescription('Please wait a moment while the bot connects to its services. Try again shortly!');
    return await interaction.editReply({ embeds: [embed] });
  }

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

      // Fetch balance directly from Firestore
      const balance = await getPlayerBalanceFromFirestore(linkedRobloxId);

      const embed = new EmbedBuilder()
        .setColor(0x00FF99)
        .setTitle('💰 Your Balance')
        .setDescription(`**Roblox ID:** ${linkedRobloxId}\n**Balance:** ${balance}`)
        .setFooter({ text: 'Powered by Attack Roblox (Data from Google Cloud Firestore)' });

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

      let apiErrorDetails = ''; // To store specific error message
      let originalSenderBalance = 0; // To store sender's balance before deduction for rollback

      try {
        // Step 1: Get sender's current balance from Firestore
        originalSenderBalance = await getPlayerBalanceFromFirestore(senderRobloxId);
        console.log(`Sender ${senderRobloxId} current balance: ${originalSenderBalance}`);

        // Step 2: Check for sufficient funds
        if (originalSenderBalance < amount) {
          const embed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('❌ Payment Failed: Insufficient Funds')
            .setDescription(`You only have **${originalSenderBalance} Robux**, but you are trying to pay **${amount} Robux**. You need more funds.`);
          return await interaction.editReply({ embeds: [embed] });
        }

        // Step 3: Get recipient's current balance from Firestore
        let recipientCurrentBalance = await getPlayerBalanceFromFirestore(recipientUserId);
        console.log(`Recipient ${recipientUserId} current balance: ${recipientCurrentBalance}`);

        // Step 4: Calculate new balances
        const newSenderBalance = originalSenderBalance - amount;
        const newRecipientBalance = recipientCurrentBalance + amount;

        // Step 5a: Deduct from sender's balance in Firestore
        console.log(`💸 Attempting to deduct ${amount} from ${senderRobloxId}. New balance: ${newSenderBalance}`);
        await updatePlayerBalanceInFirestore(senderRobloxId, newSenderBalance);
        console.log(`Sender ${senderRobloxId} balance updated to ${newSenderBalance}`);

        // Step 5b: Add to recipient's balance in Firestore
        console.log(`💸 Attempting to add ${amount} to ${recipientUserId}. New balance: ${newRecipientBalance}`);
        await updatePlayerBalanceInFirestore(recipientUserId, newRecipientBalance);
        console.log(`Recipient ${recipientUserId} balance updated to ${newRecipientBalance}`);

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
        // This catches any errors during balance checks or Firestore update calls
        console.error(`❌ Payment transaction failed: ${err.message}`);
        apiErrorDetails = err.message;

        // In a real application, you'd want to implement more robust rollback
        // for cases where only one update succeeds. For simplicity here,
        // we're relying on the `try/catch` around both updates.
        // If the recipient update fails, the sender's deduction will not be rolled back automatically here.
        // For production, consider Firestore Transactions for atomic updates.

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
                `Please contact an administrator if the issue persists.`
          )
          .setFooter({ text: 'Data from Google Cloud Firestore' });

        await interaction.editReply({ embeds: [embed] });
      }
    }

    // --- '/debug' Command: Test Bot Status and Firestore Connection ---
    if (command === 'debug') {
      console.log('🔧 Running debug...');

      const debugResults = [];

      // Bot Status
      debugResults.push(`🤖 Bot User: ${client.user ? client.user.tag : 'N/A'}`);
      debugResults.push(`🌐 Servers: ${client.guilds.cache.size}`);
      debugResults.push(`⏰ Uptime: ${process.uptime().toFixed(2)} seconds`);
      debugResults.push(`🔗 Registered Discord-Roblox links: ${Object.keys(discordLinks).length}`);

      // Firebase/Firestore Status (now checking authReady flag)
      if (authReady && db) {
        debugResults.push(`✅ Firebase Admin SDK Initialized`);
        debugResults.push(`✅ Firestore Connected`);
        // debugResults.push(`✅ Authenticated User ID: ${auth.currentUser.uid}`); // No direct current user with Admin SDK
        debugResults.push(` Firestore path for balances: artifacts/${admin.app().options.projectId}/public/data/roblox-balances`);
        try {
          // Attempt a small read from Firestore to confirm connectivity
          const testDocRef = db.collection(`artifacts/${admin.app().options.projectId}/public/data/roblox-balances`).doc('test_read_123');
          await testDocRef.get(); // Using .get() for Admin SDK
          debugResults.push(`✅ Firestore read test successful.`);
        } catch (err) {
          debugResults.push(`❌ Firestore read test failed: ${err.message}`);
        }
      } else {
        debugResults.push(`❌ Firebase/Firestore not fully initialized.`);
        debugResults.push(`   Auth Ready: ${authReady}, DB: ${!!db}`);
      }


      const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('🔧 Bot & Firestore Debug Results')
        .setDescription(`\`\`\`${debugResults.join('\n')}\`\`\``)
        .setFooter({ text: 'Check console for full details' });

      console.log('🔧 Debug Results:', debugResults);
      await interaction.editReply({ embeds: [embed] });
    }

    // --- '/register' Command: Link Roblox ID (Still uses local file) ---
    if (command === 'register') {
      const userId = interaction.options.getString('userid');

      console.log(`📝 Registering Discord ID: ${discordId} with Roblox ID: ${userId}`);

      // Validate Roblox ID format (should be numbers only)
      if (!/^\d+$/.test(userId)) {
        const embed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('❌ Invalid Roblox ID')
          .setDescription('Roblox ID should contain only numbers.\n\nExample: `5818937005`');
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
    registeredUsers: Object.keys(discordLinks).length,
    firestoreStatus: db ? 'Initialized' : 'Not Initialized',
    // No current user with Admin SDK, so remove firebaseAuthId
    // firebaseAuthId: auth?.currentUser?.uid || 'N/A'
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
