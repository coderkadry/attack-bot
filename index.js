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
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, getDocs } from 'firebase/firestore';

// --- Configuration ---
const TOKEN = process.env.DISCORD_TOKEN; // Your Discord Bot Token from .env
const CLIENT_ID = '1386338165916438538'; // Your Discord Bot's Client ID (hardcoded as per your original code)

// --- Firebase/Firestore Global Variables (Provided by Canvas Environment) ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id'; // Unique ID for your app in Canvas
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {}; // Firebase project config
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null; // Firebase custom auth token

// --- Initialize Firebase and Firestore ---
let firebaseApp;
let db;
let auth;
let currentUserId = null; // To store the authenticated user's ID

// Asynchronous initialization and authentication
async function initializeFirebaseAndAuth() {
  try {
    firebaseApp = initializeApp(firebaseConfig);
    db = getFirestore(firebaseApp);
    auth = getAuth(firebaseApp);

    // Listen for authentication state changes
    onAuthStateChanged(auth, (user) => {
      if (user) {
        currentUserId = user.uid;
        console.log(`✅ Firebase authenticated. User ID: ${currentUserId}`);
      } else {
        currentUserId = null;
        console.log('⚠️ Firebase authentication state changed: No user logged in.');
      }
    });

    // Sign in with custom token or anonymously
    if (initialAuthToken) {
      await signInWithCustomToken(auth, initialAuthToken);
      console.log('✅ Signed in with custom token.');
    } else {
      await signInAnonymously(auth);
      console.log('✅ Signed in anonymously.');
    }
  } catch (error) {
    console.error('❌ Firebase initialization or authentication failed:', error);
  }
}

// Call the initialization function
initializeFirebaseAndAuth();

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
    console.error("Firestore not initialized yet!");
    return 0; // Or throw an error depending on desired behavior
  }
  // Changed collection name to 'roblox-balances' for consistency with Firebase setup
  const balanceDocRef = doc(db, `artifacts/${appId}/public/data/roblox-balances`, String(robloxId));
  const balanceDocSnap = await getDoc(balanceDocRef);
  if (balanceDocSnap.exists()) {
    const data = balanceDocSnap.data();
    return typeof data.balance === 'number' ? data.balance : 0;
  }
  return 0; // User not found in Firestore, assume 0 balance
}

// Updates a player's balance in Firestore. Creates document if it doesn't exist.
async function updatePlayerBalanceInFirestore(robloxId, newBalance) {
  if (!db) {
    console.error("Firestore not initialized yet!");
    return; // Or throw an error
  }
  // Changed collection name to 'roblox-balances' for consistency with Firebase setup
  const balanceDocRef = doc(db, `artifacts/${appId}/public/data/roblox-balances`, String(robloxId));
  await setDoc(balanceDocRef, { balance: newBalance }, { merge: true }); // Use merge to avoid overwriting other fields if any
}

// --- Interaction Handling ---
// This is the main event listener for all slash command interactions.
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return; // Only process chat input commands

  const command = interaction.commandName;
  const discordId = interaction.user.id;

  // Ensure Firestore is ready before processing commands that interact with it
  if (!db || !auth.currentUser) {
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

      // Firebase/Firestore Status
      if (firebaseApp && db && auth && auth.currentUser) {
        debugResults.push(`✅ Firebase App Initialized`);
        debugResults.push(`✅ Firestore Connected`);
        debugResults.push(`✅ Authenticated User ID: ${auth.currentUser.uid}`);
        debugResults.push(` Firestore path for balances: artifacts/${appId}/public/data/roblox-balances`);
        try {
          // Attempt a small read from Firestore to confirm connectivity
          const testDocRef = doc(db, `artifacts/${appId}/public/data/roblox-balances`, 'test_read_123');
          await getDoc(testDocRef);
          debugResults.push(`✅ Firestore read test successful.`);
        } catch (err) {
          debugResults.push(`❌ Firestore read test failed: ${err.message}`);
        }
      } else {
        debugResults.push(`❌ Firebase/Firestore not fully initialized or authenticated.`);
        debugResults.push(`   App: ${!!firebaseApp}, DB: ${!!db}, Auth: ${!!auth}, User: ${!!auth?.currentUser}`);
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
    registeredUsers: Object.keys(discordLinks).length,
    firestoreStatus: db ? 'Initialized' : 'Not Initialized',
    firebaseAuthId: auth?.currentUser?.uid || 'N/A'
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
