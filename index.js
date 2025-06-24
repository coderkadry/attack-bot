import { Client, GatewayIntentBits, Collection, REST, Routes } from 'discord.js';
import { createRequire } from 'module'; // Corrected typo: removed extra '='
import express from 'express';
import * as admin from 'firebase-admin'; // This imports the entire firebase-admin library
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url'; // CRITICAL FIX: Corrected this import statement

// --- IMMEDIATE DEBUGGING AFTER ADMIN IMPORT ---
// These logs will help us understand the 'admin' object's state right after it's imported.
console.log('--- DEBUG: ADMIN OBJECT INSPECTION (Immediately after import) ---');
console.log('DEBUG: Is admin imported and truthy?', !!admin);
if (admin) {
    console.log('DEBUG: Type of admin:', typeof admin);
    console.log('DEBUG: Properties of admin (keys):', Object.keys(admin));
    console.log('DEBUG: admin.apps property value:', admin.apps); // Should be an array or undefined
    console.log('DEBUG: admin.credential property value:', admin.credential); // Should be an object or undefined
    if (admin.credential) {
        console.log('DEBUG: Type of admin.credential:', typeof admin.credential);
        console.log('DEBUG: Properties of admin.credential (keys):', Object.keys(admin.credential));
        console.log('DEBUG: admin.credential.cert property value:', admin.credential.cert); // Should be a function or undefined
        console.log('DEBUG: Type of admin.credential.cert:', typeof admin.credential.cert);
    } else {
        console.log('DEBUG: admin.credential is NOT defined or null.');
    }
} else {
    console.log('DEBUG: "admin" object is NOT imported or is undefined/null.');
}
console.log('----------------------------------------------------');


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
            console.log(`Service Account Project ID found: "${serviceAccount.project_id}"`);
            console.log(`Service Account client_email: "${serviceAccount.client_email}"`);
        } catch (jsonError) {
            console.error('❌ Error parsing service account key JSON:', jsonError);
            throw new Error(`Invalid JSON in serviceAccountKey.json: ${jsonError.message}`);
        }

        // --- ROBUST INITIALIZATION CHECK ---
        // Check if admin.apps exists and is an array, and if any Firebase apps are already initialized.
        // This helps prevent re-initialization errors and the "length" error.
        const isFirebaseAppInitialized = Array.isArray(admin.apps) && admin.apps.length > 0;

        if (!isFirebaseAppInitialized) {
            console.log('DEBUG: Firebase Admin SDK not yet initialized. Attempting initialization...');
            // CRITICAL CHECK: Ensure admin.credential and admin.credential.cert are available
            if (admin && admin.credential && typeof admin.credential.cert === 'function') {
                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount),
                    databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
                });
                console.log('Attempted Firebase Admin SDK initialization using admin.initializeApp().');
            } else {
                const errorMessage = '❌ CRITICAL: Firebase Admin SDK\'s credential.cert method is not available. This is usually due to a corrupted or incorrectly loaded firebase-admin package.';
                console.error(errorMessage);
                throw new Error(errorMessage);
            }
        } else {
            console.log('Firebase Admin SDK already initialized. Skipping re-initialization.');
        }

        db = admin.firestore();
        auth = admin.auth(); // Assuming auth is needed later, though not directly used for Admin SDK auth in this pattern
        console.log('✅ Firebase Admin SDK initialized and Firestore connected.');

    } catch (error) {
        console.error('❌ Firebase initialization failed:', error);
        console.error('Please verify:');
        console.error('1. The file "./serviceAccountKey.json" exists on your Google Cloud VM.');
        console.error('2. The contents of "./serviceAccountKey.json" are a valid JSON for a Firebase service account key.');
        console.error('3. That JSON file contains a field named "project_id".');
        console.error('Full error stack:', error);
        db = null; // Ensure db is null if initialization fails
        auth = null; // Ensure auth is null if initialization fails
    }
}

// Immediately attempt to initialize Firebase when the bot starts
await initializeFirebaseAdminSDK();


// --- Discord Bot Setup ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
    ],
});

client.commands = new Collection();
const commands = []; // Array to store command data for Discord API registration

// --- HARDCODED COMMANDS FOR TROUBLESHOOTING ---
// This bypasses the 'commands' folder reading to isolate Firebase issue.
// In a production bot, you would load commands dynamically from separate files.

const pingCommand = {
    data: {
        name: 'ping',
        description: 'Replies with Pong!',
        type: 1, // CHAT_INPUT
    },
    async execute(interaction) {
        await interaction.reply({ content: 'Pong!', ephemeral: true });
    },
};

const registerCommand = {
    data: {
        name: 'register',
        description: 'Links your Discord account to a Roblox ID.',
        options: [{
            name: 'roblox_id',
            type: 3, // STRING
            description: 'Your Roblox ID',
            required: true,
        }],
        type: 1, // CHAT_INPUT
    },
    async execute(interaction) {
        // Logic handled in interactionCreate event listener
    },
};

const balCommand = {
    data: {
        name: 'bal',
        description: 'Checks your linked Roblox balance.',
        type: 1, // CHAT_INPUT
    },
    async execute(interaction) {
        // Logic handled in interactionCreate event listener
    },
};

const payCommand = {
    data: {
        name: 'pay',
        description: 'Pays a user from your Roblox balance.',
        options: [
            {
                name: 'recipient',
                type: 6, // USER
                description: 'The Discord user to pay.',
                required: true,
            },
            {
                name: 'amount',
                type: 10, // NUMBER
                description: 'The amount to pay.',
                required: true,
            },
        ],
        type: 1, // CHAT_INPUT
    },
    async execute(interaction) {
        // Logic handled in interactionCreate event listener
    },
};

// Add these hardcoded commands to the bot's collection and for registration
client.commands.set(pingCommand.data.name, pingCommand);
commands.push(pingCommand.data.toJSON());

client.commands.set(registerCommand.data.name, registerCommand);
commands.push(registerCommand.data.toJSON());

client.commands.set(balCommand.data.name, balCommand);
commands.push(balCommand.data.toJSON());

client.commands.set(payCommand.data.name, payCommand);
commands.push(payCommand.data.toJSON());

// --- Firebase Firestore Functions (integrated for simplicity) ---
let discordRobloxLinks = {}; // Local cache for Discord-Roblox links

/**
 * Loads Discord-Roblox links from Firestore into local cache.
 */
async function loadDiscordRobloxLinks() {
    if (!db || typeof db.collection !== 'function') { // Check if db is valid before using
        console.log('⚠️ Firebase not initialized or db object is invalid. Cannot load Discord-Roblox links.');
        return;
    }
    try {
        const linksCollectionRef = db.collection('artifacts')
            .doc(process.env.APP_ID || 'default-app-id')
            .collection('public')
            .doc('data')
            .collection('discordRobloxLinks');

        const snapshot = await linksCollectionRef.get();
        if (snapshot.empty) {
            console.log('No existing Discord-Roblox links found in Firestore.');
            discordRobloxLinks = {};
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
        discordRobloxLinks = {};
    }
}

/**
 * Saves a Discord-Roblox link to Firestore.
 * @param {string} discordId - The Discord user's ID.
 * @param {string} robloxId - The Roblox user's ID.
 */
async function saveDiscordRobloxLink(discordId, robloxId) {
    if (!db || typeof db.collection !== 'function') {
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
        discordRobloxLinks[discordId] = robloxId;
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
    if (!db || typeof db.collection !== 'function') {
        console.error('Firebase not initialized. Cannot get user balance.');
        return 0;
    }
    try {
        const userDocRef = db.collection('artifacts')
            .doc(process.env.APP_ID || 'default-app-id')
            .collection('public')
            .doc('data')
            .collection('users')
            .doc(String(robloxId));

        const doc = await userDocRef.get();
        if (doc.exists) {
            return doc.data().balance || 0;
        }
        return 0;
    } catch (error) { // CORRECTED CATCH BLOCK for getUserBalance
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
    if (!db || typeof db.collection !== 'function') {
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

            if (newBalance < 0) {
                throw new Error("Insufficient balance.");
            }

            transaction.set(userDocRef, { balance: newBalance }, { merge: true });
        });
        return true;
    } catch (error) { // Corrected catch block
        console.error('Error updating user balance in Firestore:', error);
        return false;
    }
}


// --- Discord Bot Events ---
client.on('ready', async () => {
    console.log(`🤖 Logged in as ${client.user.tag}`);
    console.log(`🌐 Bot is active in ${client.guilds.cache.size} servers`);

    // Register slash commands globally
    const rest = new REST().setToken(process.env.DISCORD_TOKEN);
    try {
        console.log(`📦 Registering ${commands.length} slash commands...`);
        console.log(`Commands to register: ${commands.map(cmd => cmd.name)}`);

        const data = await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );

        console.log(`✅ Successfully registered ${data.length} slash commands globally`);
        console.log(`Registered commands: ${data.map(cmd => cmd.name)}`);

        // Optional: Clear guild-specific commands if you intend to only use global commands.
        console.log('🧹 Clearing existing commands...');
        for (const guild of client.guilds.cache.values()) {
            try {
                await rest.put(Routes.applicationGuildCommands(client.user.id, guild.id), { body: [] });
            } catch (guildError) {
                console.warn(`⚠️ Could not clear guild commands for ${guild.name}: ${guildError.message}`);
            }
        }

        // Load existing Discord-Roblox links from Firestore after bot setup
        await loadDiscordRobloxLinks();

        // Final success message
        console.log('🎉 Bot setup complete!');
        console.log('💡 If commands don\'t appear immediately, wait up to 1 hour for global registration');


    } catch (error) {
        console.error(`❌ Failed to register global slash commands: ${error}`);
    }
});

// 'interactionCreate' event: Fired when a user interacts with the bot
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return; // Only process chat input commands

    const command = client.commands.get(interaction.commandName);

    if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
    }

    // --- Special handling for commands that require Firebase ---
    const requiresFirebase = ['register', 'bal', 'pay']; // List commands that need Firebase
    if (requiresFirebase.includes(interaction.commandName)) {
        if (!db || typeof db.collection !== 'function') { // More robust check for Firebase availability
            console.log('Firebase required but not available');
            return interaction.reply({ content: 'This command requires Firebase, which is not available. Please wait for the bot to fully initialize.', ephemeral: true });
        }
    }

    try {
        // Custom handling for 'register', 'bal', 'pay' commands
        if (interaction.commandName === 'register') {
            const discordId = interaction.user.id;
            const robloxId = interaction.options.getString('roblox_id');
            console.log(`📝 Registering Discord ID: ${discordId} with Roblox ID: ${robloxId}`);

            await saveDiscordRobloxLink(discordId, robloxId);
            return interaction.reply({ content: `✅ Your Discord account (${interaction.user.tag}) has been linked to Roblox ID: ${robloxId}!`, ephemeral: true });
        }

        if (interaction.commandName === 'bal') {
            const discordId = interaction.user.id;
            const linkedRobloxId = discordRobloxLinks[discordId];

            if (!linkedRobloxId) {
                return interaction.reply({ content: '❌ Your Discord account is not linked to a Roblox ID. Please use `/register <your_roblox_id>` first.', ephemeral: true });
            }

            const balance = await getUserBalance(linkedRobloxId);
            return interaction.reply({ content: `💰 Your Roblox balance (ID: ${linkedRobloxId}) is: ${balance} coins.`, ephemeral: true });
        }

        if (interaction.commandName === 'pay') {
            const senderDiscordId = interaction.user.id;
            const senderRobloxId = discordRobloxLinks[senderDiscordId];

            if (!senderRobloxId) {
                return interaction.reply({ content: '❌ You must link your Discord account to a Roblox ID using `/register <your_roblox_id>` before you can send payments.', ephemeral: true });
            }

            const receiverUser = interaction.options.getUser('recipient');
            const receiverDiscordId = receiverUser.id;
            const amount = interaction.options.getNumber('amount');

            if (amount <= 0) {
                return interaction.reply({ content: '❌ Amount must be a positive number.', ephemeral: true });
            }

            const receiverRobloxId = discordRobloxLinks[receiverDiscordId];
            if (!receiverRobloxId) {
                return interaction.reply({ content: `❌ The recipient (${receiverUser.tag}) has not linked their Discord account to a Roblox ID. They need to use \`/register\` first.`, ephemeral: true });
            }

            const senderBalance = await getUserBalance(senderRobloxId);
            if (senderBalance < amount) {
                return interaction.reply({ content: `❌ Insufficient balance! Your current balance is ${senderBalance} coins, but you tried to send ${amount} coins.`, ephemeral: true });
            }

            const senderSuccess = await updateUserBalance(senderRobloxId, -amount);
            const receiverSuccess = await updateUserBalance(receiverRobloxId, amount);

            if (senderSuccess && receiverSuccess) {
                return interaction.reply({ content: `✅ Successfully paid ${amount} coins to ${receiverUser.tag} (Roblox ID: ${receiverRobloxId}). Your new balance is ${senderBalance - amount} coins.`, ephemeral: false });
            } else {
                console.error('Partial transaction failure detected. Attempting to revert...');
                if (senderSuccess) await updateUserBalance(senderRobloxId, amount);
                if (receiverSuccess) await updateUserBalance(receiverRobloxId, -amount);
                return interaction.reply({ content: '❌ Failed to complete the payment due to an error. Please try again later.', ephemeral: true });
            }
        }

        // For commands that don't require special Firebase handling in this block (e.g., 'ping')
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
const PORT = process.env.PORT || 8080;

app.get('/', (req, res) => {
    res.status(200).send('Bot is running!');
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
        process.exit(1); // Exit if Discord login fails
    });
