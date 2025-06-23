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
 */
async function initializeFirebaseAdminSDK() {
    console.log('🔥 Starting Firebase initialization...');
    try {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const serviceAccountPath = path.resolve(__dirname, './serviceAccountKey.json');

        console.log(`Attempting to read service account key from: ${serviceAccountPath}`);

        if (!fs.existsSync(serviceAccountPath)) {
            console.warn(`⚠️ Warning: serviceAccountKey.json not found at ${serviceAccountPath}`);
            console.log('Firebase features will be disabled. Bot will continue without Firebase.');
            return;
        }

        const serviceAccountContent = fs.readFileSync(serviceAccountPath, 'utf8');
        let serviceAccount;
        
        try {
            serviceAccount = JSON.parse(serviceAccountContent);
            console.log('Successfully parsed service account key JSON.');
            console.log(`Service Account Project ID: "${serviceAccount.project_id}"`);
        } catch (jsonError) {
            console.error('❌ Error parsing service account key JSON:', jsonError);
            throw new Error(`Invalid JSON in serviceAccountKey.json: ${jsonError.message}`);
        }

        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
            });
        }

        db = admin.firestore();
        auth = admin.auth();
        console.log('✅ Firebase Admin SDK initialized and Firestore connected.');

    } catch (error) {
        console.error('❌ Firebase initialization failed:', error.message);
        console.log('Bot will continue without Firebase features.');
        db = null;
        auth = null;
    }
}

// --- Discord Bot Setup ---
console.log('🤖 Setting up Discord client...');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
    ],
});

// Create a collection to hold bot commands
client.commands = new Collection();
const commands = [];

// Load commands function
async function loadCommands() {
    try {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const foldersPath = path.join(__dirname, 'commands');
        
        // Check if commands folder exists
        if (!fs.existsSync(foldersPath)) {
            console.log('📁 No commands folder found. Creating basic commands...');
            // Create basic commands if folder doesn't exist
            createBasicCommands();
            return;
        }

        const commandFolders = fs.readdirSync(foldersPath);
        
        for (const folder of commandFolders) {
            const commandsPath = path.join(foldersPath, folder);
            if (!fs.statSync(commandsPath).isDirectory()) continue;
            
            const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
            
            for (const file of commandFiles) {
                const filePath = path.join(commandsPath, file);
                try {
                    const command = await import(filePath);
                    if ('data' in command && 'execute' in command) {
                        client.commands.set(command.data.name, command);
                        commands.push(command.data.toJSON());
                        console.log(`✅ Loaded command: ${command.data.name}`);
                    } else {
                        console.log(`⚠️ Command at ${filePath} is missing required properties.`);
                    }
                } catch (error) {
                    console.error(`❌ Failed to load command from ${filePath}:`, error.message);
                }
            }
        }
        console.log(`📦 Loaded ${commands.length} commands total.`);
    } catch (error) {
        console.error('❌ Error loading commands:', error.message);
        console.log('Bot will continue with basic functionality.');
    }
}

// Create basic commands if no commands folder exists
function createBasicCommands() {
    const pingCommand = {
        data: {
            name: 'ping',
            description: 'Replies with Pong!',
            toJSON: () => ({ name: 'ping', description: 'Replies with Pong!' })
        },
        execute: async (interaction) => {
            await interaction.reply('Pong!');
        }
    };
    
    client.commands.set('ping', pingCommand);
    commands.push(pingCommand.data.toJSON());
    console.log('✅ Created basic ping command');
}

// --- Firebase Functions ---
let discordRobloxLinks = {};

async function loadDiscordRobloxLinks() {
    if (!db) {
        console.log('⚠️ Firebase not initialized. Skipping Discord-Roblox links load.');
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
            console.log('No existing Discord-Roblox links found.');
            return;
        }
        
        const links = {};
        snapshot.forEach(doc => {
            links[doc.id] = doc.data().robloxId;
        });
        discordRobloxLinks = links;
        console.log(`🔗 Loaded ${Object.keys(discordRobloxLinks).length} Discord-Roblox links.`);
    } catch (error) {
        console.error('Error loading Discord-Roblox links:', error.message);
    }
}

async function saveDiscordRobloxLink(discordId, robloxId) {
    if (!db) {
        console.error('Firebase not initialized. Cannot save link.');
        return false;
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
        return true;
    } catch (error) {
        console.error('Error saving Discord-Roblox link:', error.message);
        return false;
    }
}

async function getUserBalance(robloxId) {
    if (!db) return 0;
    try {
        const userDocRef = db.collection('artifacts')
            .doc(process.env.APP_ID || 'default-app-id')
            .collection('public')
            .doc('data')
            .collection('users')
            .doc(String(robloxId));

        const doc = await userDocRef.get();
        return doc.exists ? doc.data().balance || 0 : 0;
    } catch (error) {
        console.error('Error getting user balance:', error.message);
        return 0;
    }
}

async function updateUserBalance(robloxId, amount) {
    if (!db) return false;
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
    } catch (error) {
        console.error('Error updating user balance:', error.message);
        return false;
    }
}

// --- Discord Bot Events ---
client.once('ready', async () => {
    console.log(`🤖 Bot logged in as ${client.user.tag}`);
    console.log(`🌐 Active in ${client.guilds.cache.size} servers`);

    // Register slash commands
    if (commands.length > 0) {
        const rest = new REST().setToken(process.env.DISCORD_TOKEN);
        try {
            console.log('📦 Registering slash commands...');
            const data = await rest.put(
                Routes.applicationCommands(client.user.id),
                { body: commands }
            );
            console.log(`✅ Registered ${data.length} slash commands`);
        } catch (error) {
            console.error('❌ Failed to register commands:', error.message);
        }
    }

    // Load Firebase data
    await loadDiscordRobloxLinks();
    console.log('🎉 Bot setup complete!');
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        // Handle Firebase-dependent commands
        if (['register', 'bal', 'pay'].includes(interaction.commandName) && !db) {
            return interaction.reply({ 
                content: '❌ This command requires Firebase, which is not available.', 
                ephemeral: true 
            });
        }

        // Custom command handling
        if (interaction.commandName === 'register') {
            const discordId = interaction.user.id;
            const robloxId = interaction.options.getString('roblox_id');
            
            const success = await saveDiscordRobloxLink(discordId, robloxId);
            if (success) {
                return interaction.reply({ 
                    content: `✅ Linked Discord account to Roblox ID: ${robloxId}!`, 
                    ephemeral: true 
                });
            } else {
                return interaction.reply({ 
                    content: '❌ Failed to save link. Please try again later.', 
                    ephemeral: true 
                });
            }
        }

        if (interaction.commandName === 'bal') {
            const discordId = interaction.user.id;
            const linkedRobloxId = discordRobloxLinks[discordId];

            if (!linkedRobloxId) {
                return interaction.reply({ 
                    content: '❌ Not linked to a Roblox account. Use `/register` first.', 
                    ephemeral: true 
                });
            }

            const balance = await getUserBalance(linkedRobloxId);
            return interaction.reply({ 
                content: `💰 Balance (Roblox ID: ${linkedRobloxId}): ${balance} coins`, 
                ephemeral: true 
            });
        }

        if (interaction.commandName === 'pay') {
            const senderDiscordId = interaction.user.id;
            const senderRobloxId = discordRobloxLinks[senderDiscordId];

            if (!senderRobloxId) {
                return interaction.reply({ 
                    content: '❌ You must register first with `/register`.', 
                    ephemeral: true 
                });
            }

            const receiverUser = interaction.options.getUser('recipient');
            const receiverDiscordId = receiverUser.id;
            const amount = interaction.options.getNumber('amount');

            if (amount <= 0) {
                return interaction.reply({ 
                    content: '❌ Amount must be positive.', 
                    ephemeral: true 
                });
            }

            const receiverRobloxId = discordRobloxLinks[receiverDiscordId];
            if (!receiverRobloxId) {
                return interaction.reply({ 
                    content: `❌ ${receiverUser.tag} hasn't registered yet.`, 
                    ephemeral: true 
                });
            }

            const senderBalance = await getUserBalance(senderRobloxId);
            if (senderBalance < amount) {
                return interaction.reply({ 
                    content: `❌ Insufficient balance! You have ${senderBalance} coins.`, 
                    ephemeral: true 
                });
            }

            const senderSuccess = await updateUserBalance(senderRobloxId, -amount);
            const receiverSuccess = await updateUserBalance(receiverRobloxId, amount);

            if (senderSuccess && receiverSuccess) {
                return interaction.reply({ 
                    content: `✅ Paid ${amount} coins to ${receiverUser.tag}. New balance: ${senderBalance - amount}`, 
                    ephemeral: false 
                });
            } else {
                // Attempt to revert on failure
                if (senderSuccess) await updateUserBalance(senderRobloxId, amount);
                if (receiverSuccess) await updateUserBalance(receiverRobloxId, -amount);
                return interaction.reply({ 
                    content: '❌ Payment failed. Please try again.', 
                    ephemeral: true 
                });
            }
        }

        // Execute other commands
        await command.execute(interaction);
    } catch (error) {
        console.error('Command execution error:', error.message);
        const errorMessage = 'There was an error executing this command!';
        
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: errorMessage, ephemeral: true });
        } else {
            await interaction.reply({ content: errorMessage, ephemeral: true });
        }
    }
});

// Error handling
client.on('error', error => {
    console.error('Discord client error:', error.message);
});

process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error.message);
});

// --- Web Server Setup ---
const app = express();
const PORT = process.env.PORT || 8080;

app.get('/', (req, res) => {
    res.status(200).json({
        status: 'Bot is running!',
        botOnline: client.isReady(),
        firebaseConnected: !!db,
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    res.status(200).json({
        bot: client.isReady() ? 'online' : 'offline',
        firebase: db ? 'connected' : 'disconnected',
        uptime: process.uptime()
    });
});

app.listen(PORT, () => {
    console.log(`🌐 Web server running on port ${PORT}`);
});

// --- Initialization ---
async function startBot() {
    console.log('🚀 Starting bot initialization...');
    
    // Check environment variables
    if (!process.env.DISCORD_TOKEN) {
        console.error('❌ DISCORD_TOKEN not found in environment variables!');
        console.log('Make sure you have a .env file with DISCORD_TOKEN=your_token_here');
        process.exit(1);
    }

    console.log(`🔍 Discord token length: ${process.env.DISCORD_TOKEN.length}`);
    console.log(`🔍 Node.js version: ${process.version}`);
    
    // Initialize Firebase (non-blocking)
    await initializeFirebaseAdminSDK();
    
    // Load commands
    await loadCommands();
    
    // Login to Discord
    try {
        console.log('🔑 Logging in to Discord...');
        await client.login(process.env.DISCORD_TOKEN);
    } catch (error) {
        console.error('❌ Discord login failed:', error.message);
        console.log('Common causes:');
        console.log('1. Invalid token');
        console.log('2. Token expired');
        console.log('3. Bot deleted from Discord Developer Portal');
        console.log('4. Network connectivity issues');
        process.exit(1);
    }
}

// Start the bot
startBot().catch(error => {
    console.error('❌ Failed to start bot:', error.message);
    process.exit(1);
});
