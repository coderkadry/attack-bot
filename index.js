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
            type: 1, // CHAT_INPUT
            toJSON: () => ({ 
                name: 'ping', 
                description: 'Replies with Pong!',
                type: 1
            })
        },
        execute: async (interaction) => {
            console.log('Executing ping command for user:', interaction.user.tag);
            await interaction.reply('Pong! 🏓');
        }
    };

    const registerCommand = {
        data: {
            name: 'register',
            description: 'Link your Discord account to a Roblox ID',
            type: 1,
            options: [{
                name: 'roblox_id',
                description: 'Your Roblox User ID',
                type: 3, // STRING
                required: true
            }],
            toJSON: () => ({
                name: 'register',
                description: 'Link your Discord account to a Roblox ID',
                type: 1,
                options: [{
                    name: 'roblox_id',
                    description: 'Your Roblox User ID',
                    type: 3,
                    required: true
                }]
            })
        },
        execute: async (interaction) => {
            console.log('Executing register command for user:', interaction.user.tag);
            // This will be handled in the main interaction handler
        }
    };

    const balCommand = {
        data: {
            name: 'bal',
            description: 'Check your Roblox account balance',
            type: 1,
            toJSON: () => ({
                name: 'bal',
                description: 'Check your Roblox account balance',
                type: 1
            })
        },
        execute: async (interaction) => {
            console.log('Executing bal command for user:', interaction.user.tag);
            // This will be handled in the main interaction handler
        }
    };

    const payCommand = {
        data: {
            name: 'pay',
            description: 'Send coins to another user',
            type: 1,
            options: [
                {
                    name: 'recipient',
                    description: 'The user to send coins to',
                    type: 6, // USER
                    required: true
                },
                {
                    name: 'amount',
                    description: 'Amount of coins to send',
                    type: 10, // NUMBER
                    required: true
                }
            ],
            toJSON: () => ({
                name: 'pay',
                description: 'Send coins to another user',
                type: 1,
                options: [
                    {
                        name: 'recipient',
                        description: 'The user to send coins to',
                        type: 6,
                        required: true
                    },
                    {
                        name: 'amount',
                        description: 'Amount of coins to send',
                        type: 10,
                        required: true
                    }
                ]
            })
        },
        execute: async (interaction) => {
            console.log('Executing pay command for user:', interaction.user.tag);
            // This will be handled in the main interaction handler
        }
    };
    
    // Add all commands
    const basicCommands = [pingCommand, registerCommand, balCommand, payCommand];
    
    basicCommands.forEach(cmd => {
        client.commands.set(cmd.data.name, cmd);
        commands.push(cmd.data.toJSON());
        console.log(`✅ Created basic command: ${cmd.data.name}`);
    });
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
    console.log(`🤖 Bot logged in as ${client.user.tag} (ID: ${client.user.id})`);
    console.log(`🌐 Active in ${client.guilds.cache.size} servers`);

    // Register slash commands with better error handling
    if (commands.length > 0) {
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
        try {
            console.log(`📦 Registering ${commands.length} slash commands...`);
            console.log('Commands to register:', commands.map(cmd => cmd.name));
            
            // Clear existing commands first
            console.log('🧹 Clearing existing commands...');
            await rest.put(Routes.applicationCommands(client.user.id), { body: [] });
            
            // Wait a moment for Discord to process
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Register new commands
            const data = await rest.put(
                Routes.applicationCommands(client.user.id),
                { body: commands }
            );
            
            console.log(`✅ Successfully registered ${data.length} slash commands globally`);
            console.log('Registered commands:', data.map(cmd => cmd.name));
            console.log('⏰ Commands may take up to 1 hour to appear globally');
            
        } catch (error) {
            console.error('❌ Failed to register commands:', error);
            if (error.code === 50001) {
                console.error('Missing Access - Check bot permissions');
            } else if (error.code === 10002) {
                console.error('Unknown Application - Check your bot token');
            } else {
                console.error('Full error:', error.rawError || error);
            }
        }
    } else {
        console.log('⚠️ No commands to register');
    }

    // Load Firebase data
    await loadDiscordRobloxLinks();
    console.log('🎉 Bot setup complete!');
    console.log('💡 If commands don\'t appear immediately, wait up to 1 hour for global registration');
});

client.on('interactionCreate', async interaction => {
    console.log(`📨 Received interaction: ${interaction.type} from ${interaction.user.tag}`);
    
    if (!interaction.isChatInputCommand()) {
        console.log('Not a chat input command, ignoring');
        return;
    }

    console.log(`🔧 Processing command: /${interaction.commandName}`);

    const command = client.commands.get(interaction.commandName);
    if (!command) {
        console.error(`❌ No command found for: ${interaction.commandName}`);
        return await interaction.reply({
            content: '❌ Command not found!',
            ephemeral: true
        });
    }

    try {
        // Handle Firebase-dependent commands
        if (['register', 'bal', 'pay'].includes(interaction.commandName) && !db) {
            console.log('Firebase required but not available');
            return await interaction.reply({ 
                content: '❌ This command requires Firebase, which is not available.', 
                ephemeral: true 
            });
        }

        // Custom command handling with detailed logging
        if (interaction.commandName === 'ping') {
            console.log('Executing ping command');
            return await interaction.reply({
                content: 'Pong! 🏓 Bot is working correctly!',
                ephemeral: false
            });
        }

        if (interaction.commandName === 'register') {
            console.log('Executing register command');
            
            const discordId = interaction.user.id;
            const robloxId = interaction.options.getString('roblox_id');
            
            console.log(`Linking Discord ${discordId} to Roblox ${robloxId}`);
            
            const success = await saveDiscordRobloxLink(discordId, robloxId);
            if (success) {
                return await interaction.reply({ 
                    content: `✅ Successfully linked your Discord account to Roblox ID: ${robloxId}!`, 
                    ephemeral: true 
                });
            } else {
                return await interaction.reply({ 
                    content: '❌ Failed to save link. Please try again later.', 
                    ephemeral: true 
                });
            }
        }

        if (interaction.commandName === 'bal') {
            console.log('Executing balance command');
            
            const discordId = interaction.user.id;
            const linkedRobloxId = discordRobloxLinks[discordId];

            if (!linkedRobloxId) {
                return await interaction.reply({ 
                    content: '❌ Your Discord account is not linked to a Roblox account. Use `/register <roblox_id>` first.', 
                    ephemeral: true 
                });
            }

            const balance = await getUserBalance(linkedRobloxId);
            return await interaction.reply({ 
                content: `💰 Your balance (Roblox ID: ${linkedRobloxId}): **${balance} coins**`, 
                ephemeral: true 
            });
        }

        if (interaction.commandName === 'pay') {
            console.log('Executing pay command');
            
            const senderDiscordId = interaction.user.id;
            const senderRobloxId = discordRobloxLinks[senderDiscordId];

            if (!senderRobloxId) {
                return await interaction.reply({ 
                    content: '❌ You must register your Roblox account first using `/register <roblox_id>`.', 
                    ephemeral: true 
                });
            }

            const receiverUser = interaction.options.getUser('recipient');
            const receiverDiscordId = receiverUser.id;
            const amount = interaction.options.getNumber('amount');

            if (amount <= 0) {
                return await interaction.reply({ 
                    content: '❌ Amount must be a positive number.', 
                    ephemeral: true 
                });
            }

            const receiverRobloxId = discordRobloxLinks[receiverDiscordId];
            if (!receiverRobloxId) {
                return await interaction.reply({ 
                    content: `❌ ${receiverUser.tag} hasn't linked their Roblox account yet. They need to use \`/register\` first.`, 
                    ephemeral: true 
                });
            }

            if (senderDiscordId === receiverDiscordId) {
                return await interaction.reply({
                    content: '❌ You cannot send coins to yourself!',
                    ephemeral: true
                });
            }

            const senderBalance = await getUserBalance(senderRobloxId);
            if (senderBalance < amount) {
                return await interaction.reply({ 
                    content: `❌ Insufficient balance! You have **${senderBalance} coins** but tried to send **${amount} coins**.`, 
                    ephemeral: true 
                });
            }

            // Defer reply for potentially long operation
            await interaction.deferReply();

            const senderSuccess = await updateUserBalance(senderRobloxId, -amount);
            const receiverSuccess = await updateUserBalance(receiverRobloxId, amount);

            if (senderSuccess && receiverSuccess) {
                return await interaction.editReply({ 
                    content: `✅ Successfully sent **${amount} coins** to ${receiverUser.tag}!\nYour new balance: **${senderBalance - amount} coins**`
                });
            } else {
                // Attempt to revert on failure
                if (senderSuccess) await updateUserBalance(senderRobloxId, amount);
                if (receiverSuccess) await updateUserBalance(receiverRobloxId, -amount);
                return await interaction.editReply({ 
                    content: '❌ Payment failed due to a database error. Please try again later.'
                });
            }
        }

        // Execute other commands
        console.log(`Executing command via command.execute(): ${interaction.commandName}`);
        await command.execute(interaction);
        
    } catch (error) {
        console.error(`❌ Command execution error for /${interaction.commandName}:`, error);
        
        const errorMessage = `❌ There was an error executing the \`/${interaction.commandName}\` command!\n\`\`\`${error.message}\`\`\``;
        
        try {
            if (interaction.deferred) {
                await interaction.editReply({ content: errorMessage });
            } else if (interaction.replied) {
                await interaction.followUp({ content: errorMessage, ephemeral: true });
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        } catch (replyError) {
            console.error('Failed to send error message:', replyError);
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
