import { Client, GatewayIntentBits, Collection, REST, Routes } from 'discord.js';
import { createRequire } from 'module';
import express from 'express';
import * as admin from 'firebase-admin';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Use createRequire for dotenv as it's a CJS module in an ESM context
const require = createRequire(import.meta.url);
require('dotenv').config();

// --- Firebase Initialization ---
let db; // Firestore database instance
let auth; // Firebase authentication instance

/**
 * Initializes the Firebase Admin SDK and connects to Firestore.
 * This function attempts to read the service account key, parse it,
 * and set up the Firebase app.
 */
async function initializeFirebaseAdminSDK() {
    console.log('🔥 Starting Firebase initialization...');
    try {
        // Determine the correct path to serviceAccountKey.json
        // __filename and __dirname are not directly available in ES Modules.
        // This calculates them to resolve the path correctly.
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const serviceAccountPath = path.resolve(__dirname, './serviceAccountKey.json');

        console.log(`Attempting to read service account key from: ${serviceAccountPath}`);

        // Check if the service account key file exists
        if (!fs.existsSync(serviceAccountPath)) {
            console.error(`❌ Error: serviceAccountKey.json not found at ${serviceAccountPath}`);
            throw new Error('Service account key file not found. Please ensure it exists in the bot\'s root directory.');
        }

        // Read the service account key file content
        const serviceAccountContent = fs.readFileSync(serviceAccountPath, 'utf8');
        console.log('Successfully read service account key file content.');

        // Attempt to parse the JSON content
        let serviceAccount;
        try {
            serviceAccount = JSON.parse(serviceAccountContent);
            console.log('Successfully parsed service account key JSON.');
            // Log project ID and client email for verification (sensitive info, but useful for debugging)
            console.log(`Service Account Project ID found: "${serviceAccount.project_id}"`);
            console.log(`Service Account client_email: "${serviceAccount.client_email}"`);
        } catch (jsonError) {
            console.error('❌ Error parsing service account key JSON:', jsonError);
            throw new Error(`Invalid JSON in serviceAccountKey.json: ${jsonError.message}`);
        }

        // Initialize Firebase Admin SDK if not already initialized
        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount), // This line uses the 'cert' method
                databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
            });
        } else {
            console.log('Firebase Admin SDK already initialized.');
        }

        // Get Firestore and Auth instances
        db = admin.firestore();
        auth = admin.auth();
        console.log('✅ Firebase Admin SDK initialized and Firestore connected.');

    } catch (error) {
        console.error('❌ Firebase initialization or authentication failed:', error);
        console.error('Please verify:');
        console.error('1. The file "./serviceAccountKey.json" exists on your Google Cloud VM.');
        console.error('2. The contents of "./serviceAccountKey.json" are a valid JSON for a Firebase service account key.');
        console.error('3. That JSON file contains a field named "project_id".');
        console.error('Full error stack:', error);
        // Ensure db and auth are null if initialization fails to prevent further errors
        db = null;
        auth = null;
    }
}

// Immediately attempt to initialize Firebase when the bot starts
// Using 'await' at the top level of a module requires Node.js v14.8.0+
await initializeFirebaseAdminSDK();


// --- Discord Bot Setup ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,           // Required for guild-related events (e.g., slash commands)
        GatewayIntentBits.GuildMessages,    // Required for message-related events (if needed, good practice)
        GatewayIntentBits.MessageContent,   // Required to read message content (important for commands)
        GatewayIntentBits.DirectMessages,   // Required for DMs (e.g., bot responding in DMs)
    ],
});

// Create a collection to hold bot commands
client.commands = new Collection();
const commands = []; // Array to store command data for Discord API registration

// Construct paths to commands folder
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const foldersPath = path.join(__dirname, 'commands'); // Assumes 'commands' folder is sibling to index.js
const commandFolders = fs.readdirSync(foldersPath); // Read subfolders within 'commands'

for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        try {
            // Dynamically import each command file
            const command = await import(filePath);
            // Ensure the imported object has 'data' and 'execute' properties
            if ('data' in command && 'execute' in command) {
                client.commands.set(command.data.name, command);
                commands.push(command.data.toJSON()); // Convert command data to JSON for Discord API
            } else {
                console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
            }
        } catch (error) {
            console.error(`[ERROR] Failed to load command from ${filePath}:`, error);
        }
    }
}

// --- Firebase Firestore Functions (integrated for simplicity) ---
// In a larger app, these might be in a separate 'data' or 'firebaseService' module.
let discordRobloxLinks = {}; // Local cache for Discord-Roblox links

/**
 * Loads Discord-Roblox links from Firestore into local cache.
 */
async function loadDiscordRobloxLinks() {
    if (!db) {
        console.log('⚠️ Firebase not initialized. Cannot load Discord-Roblox links.');
        return;
    }
    try {
        // Construct the collection reference for public links
        // The path reflects Firestore security rules: /artifacts/{appId}/public/data/discordRobloxLinks/{discordId}
        const linksCollectionRef = db.collection('artifacts')
            .doc(process.env.APP_ID || 'default-app-id') // Use APP_ID for multi-app support or a default
            .collection('public')
            .doc('data')
            .collection('discordRobloxLinks');

        const snapshot = await linksCollectionRef.get();
        if (snapshot.empty) {
            console.log('No existing Discord-Roblox links found in Firestore.');
            discordRobloxLinks = {}; // Ensure cache is empty
            return;
        }
        const links = {};
        snapshot.forEach(doc => {
            links[doc.id] = doc.data().robloxId;
        });
        discordRobloxLinks = links;
        console.log(`🔗 Loaded ${Object.keys(discordRobloxLinks).length} Discord-Roblox links.`);
    } catch (error) {
        console.error('Error loading Discord-Roblox links from Firestore:', error);
        discordRobloxLinks = {}; // Initialize with empty object on error to prevent crashes
    }
}

/**
 * Saves a Discord-Roblox link to Firestore.
 * @param {string} discordId - The Discord user's ID.
 * @param {string} robloxId - The Roblox user's ID.
 */
async function saveDiscordRobloxLink(discordId, robloxId) {
    if (!db) {
        console.error('Firebase not initialized. Cannot save Discord-Roblox link.');
        return;
    }
    try {
        const linksCollectionRef = db.collection('artifacts')
            .doc(process.env.APP_ID || 'default-app-id')
            .collection('public')
            .doc('data')
            .collection('discordRobloxLinks');
        await linksCollectionRef.doc(discordId).set({ robloxId });
        discordRobloxLinks[discordId] = robloxId; // Update local cache
        console.log('🔗 Discord-Roblox link saved successfully.');
    } catch (error) {
        console.error('Error saving Discord-Roblox link to Firestore:', error);
    }
}

/**
 * Retrieves a user's balance from Firestore.
 * @param {string} robloxId - The Roblox user's ID.
 * @returns {Promise<number>} The user's balance, or 0 if not found/error.
 */
async function getUserBalance(robloxId) {
    if (!db) {
        console.error('Firebase not initialized. Cannot get user balance.');
        return 0;
    }
    try {
        const userDocRef = db.collection('artifacts')
            .doc(process.env.APP_ID || 'default-app-id')
            .collection('public')
            .doc('data')
            .collection('users')
            .doc(String(robloxId)); // Ensure ID is a string

        const doc = await userDocRef.get();
        if (doc.exists) {
            return doc.data().balance || 0; // Return balance or 0 if not set
        }
        return 0; // Return 0 if document does not exist
    } catch (error) {
        console.error('Error getting user balance from Firestore:', error);
        return 0;
    }
}

/**
 * Updates a user's balance in Firestore using a transaction for consistency.
 * @param {string} robloxId - The Roblox user's ID.
 * @param {number} amount - The amount to add (positive for add, negative for subtract).
 * @returns {Promise<boolean>} True if update successful, false otherwise.
 */
async function updateUserBalance(robloxId, amount) {
    if (!db) {
        console.error('Firebase not initialized. Cannot update user balance.');
        return false;
    }
    try {
        const userDocRef = db.collection('artifacts')
            .doc(process.env.APP_ID || 'default-app-id')
            .collection('public')
            .doc('data')
            .collection('users')
            .doc(String(robloxId));

        await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(userDocRef);
            const currentBalance = doc.exists ? doc.data().balance || 0 : 0;
            const newBalance = currentBalance + amount;

            // Prevent negative balances if subtracting
            if (newBalance < 0) {
                throw new Error("Insufficient balance.");
            }

            transaction.set(userDocRef, { balance: newBalance }, { merge: true });
        });
        return true;
    } catch (error) {
        console.error('Error updating user balance in Firestore:', error);
        return false;
    }
}


// --- Discord Bot Events ---

// 'ready' event: Fired when the bot successfully logs in
client.on('ready', async () => {
    console.log(`🤖 Logged in as ${client.user.tag}`);
    console.log(`🌐 Bot is active in ${client.guilds.cache.size} servers`);

    // Register slash commands globally
    const rest = new REST().setToken(process.env.DISCORD_TOKEN);
    try {
        console.log(`📦 Registering global slash commands...`);
        console.log(`🔧 Commands to register: ${commands.map(cmd => cmd.name)}`);

        // Use Routes.applicationCommands for global commands
        const data = await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );

        console.log(`✅ Global slash commands registered successfully!`);
        console.log(`📋 Registered commands: ${data.map(cmd => cmd.name)}`);

        // Optional: Clear guild-specific commands if you intend to only use global commands.
        // This prevents old, unwanted commands from lingering on specific servers.
        console.log('🧹 Clearing any old guild-specific commands (if present)...');
        for (const guild of client.guilds.cache.values()) {
            try {
                await rest.put(Routes.applicationGuildCommands(client.user.id, guild.id), { body: [] });
                console.log(`✅ Cleared guild commands for ${guild.name}`);
            } catch (guildError) {
                console.warn(`⚠️ Could not clear guild commands for ${guild.name}: ${guildError.message}`);
            }
        }

        console.log('🎉 Bot setup complete! Commands should be available globally in 1-5 minutes.');

        // Load existing Discord-Roblox links from Firestore after bot setup
        await loadDiscordRobloxLinks();

    } catch (error) {
        console.error(`❌ Failed to register global slash commands: ${error}`);
    }
});

// 'interactionCreate' event: Fired when a user interacts with the bot (e.g., uses a slash command)
client.on('interactionCreate', async interaction => {
    // Only process chat input commands (slash commands)
    if (!interaction.isChatInputCommand()) return;

    // Check if Firebase is initialized before proceeding with commands that require it
    if (!db) {
        console.log('Firebase not ready. Responding with initialization message.');
        return interaction.reply({ content: 'Bot initializing. Please wait a moment while the bot connects to its services. Try again shortly!', ephemeral: true });
    }

    const command = client.commands.get(interaction.commandName);

    if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
    }

    try {
        // --- Custom command handling (for commands that interact with Firebase) ---
        // 'register' command: Links a Discord ID to a Roblox ID
        if (interaction.commandName === 'register') {
            const discordId = interaction.user.id;
            const robloxId = interaction.options.getString('roblox_id');
            console.log(`📝 Registering Discord ID: ${discordId} with Roblox ID: ${robloxId}`);

            await saveDiscordRobloxLink(discordId, robloxId);
            console.log(`✅ Successfully linked Discord ${discordId} to Roblox ${robloxId} locally.`);
            return interaction.reply({ content: `✅ Your Discord account (${interaction.user.tag}) has been linked to Roblox ID: ${robloxId}!`, ephemeral: true });
        }

        // 'bal' command: Checks a user's Roblox balance
        if (interaction.commandName === 'bal') {
            const discordId = interaction.user.id;
            const linkedRobloxId = discordRobloxLinks[discordId]; // Get Roblox ID from local cache

            if (!linkedRobloxId) {
                return interaction.reply({ content: '❌ Your Discord account is not linked to a Roblox ID. Please use `/register <your_roblox_id>` first.', ephemeral: true });
            }

            const balance = await getUserBalance(linkedRobloxId); // Fetch balance from Firestore
            return interaction.reply({ content: `💰 Your Roblox balance (ID: ${linkedRobloxId}) is: ${balance} coins.`, ephemeral: true });
        }

        // 'pay' command: Transfers coins between Roblox accounts
        if (interaction.commandName === 'pay') {
            const senderDiscordId = interaction.user.id;
            const senderRobloxId = discordRobloxLinks[senderDiscordId]; // Get sender's Roblox ID

            if (!senderRobloxId) {
                return interaction.reply({ content: '❌ You must link your Discord account to a Roblox ID using `/register <your_roblox_id>` before you can send payments.', ephemeral: true });
            }

            const receiverUser = interaction.options.getUser('recipient'); // Get Discord user object for recipient
            const receiverDiscordId = receiverUser.id;
            const amount = interaction.options.getNumber('amount');

            if (amount <= 0) {
                return interaction.reply({ content: '❌ Amount must be a positive number.', ephemeral: true });
            }

            const receiverRobloxId = discordRobloxLinks[receiverDiscordId]; // Get recipient's Roblox ID
            if (!receiverRobloxId) {
                return interaction.reply({ content: `❌ The recipient (${receiverUser.tag}) has not linked their Discord account to a Roblox ID. They need to use \`/register\` first.`, ephemeral: true });
            }

            // Check sender's balance before attempting the transaction
            const senderBalance = await getUserBalance(senderRobloxId);
            if (senderBalance < amount) {
                return interaction.reply({ content: `❌ Insufficient balance! Your current balance is ${senderBalance} coins, but you tried to send ${amount} coins.`, ephemeral: true });
            }

            // Perform the transaction: deduct from sender, add to receiver
            const senderSuccess = await updateUserBalance(senderRobloxId, -amount);
            const receiverSuccess = await updateUserBalance(receiverRobloxId, amount);

            if (senderSuccess && receiverSuccess) {
                // If both updates are successful, reply with success message
                return interaction.reply({ content: `✅ Successfully paid ${amount} coins to ${receiverUser.tag} (Roblox ID: ${receiverRobloxId}). Your new balance is ${senderBalance - amount} coins.`, ephemeral: false });
            } else {
                // If the transaction failed, attempt to revert any partial changes
                console.error('Partial transaction failure detected. Attempting to revert...');
                if (senderSuccess) {
                    await updateUserBalance(senderRobloxId, amount); // Revert sender's balance
                    console.log('Sender balance reverted.');
                }
                if (receiverSuccess) {
                    await updateUserBalance(receiverRobloxId, -amount); // Revert receiver's balance
                    console.log('Receiver balance reverted.');
                }
                return interaction.reply({ content: '❌ Failed to complete the payment due to an error. Please try again later.', ephemeral: true });
            }
        }

        // For other commands (e.g., 'debug' or any future commands without custom logic here), execute them directly
        await command.execute(interaction);
    } catch (error) {
        console.error('[COMMAND EXECUTION ERROR]:', error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
        } else {
            await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
        }
    }
});

// --- Web Server Setup for Health Checks ---
const app = express();
const PORT = process.env.PORT || 8080; // Default to port 8080

app.get('/', (req, res) => {
    res.status(200).send('Bot is running!'); // Simple health check endpoint
});

app.listen(PORT, () => {
    console.log(`🌐 Web server running on port ${PORT}`);
});

// --- Bot Login ---
console.log(`🔍 DISCORD_TOKEN exists: ${!!process.env.DISCORD_TOKEN}`);
if (process.env.DISCORD_TOKEN) {
    console.log(`🔍 TOKEN length: ${process.env.DISCORD_TOKEN.length}`);
}
console.log(`🔍 Node.js version: ${process.version}`);
console.log(`🔍 Working directory: ${process.cwd()}`);

console.log('🚀 Attempting to login to Discord...');
client.login(process.env.DISCORD_TOKEN)
    .catch(error => {
        console.error('❌ Discord login failed:', error);
        // If Discord login fails, the process should probably exit as the bot won't function.
        process.exit(1);
    });
