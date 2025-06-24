import { Client, GatewayIntentBits, Collection, REST, Routes } from 'discord.js';
import { createRequire } from 'module'; // Corrected typo: removed extra '='
import express from 'express';
import * => {
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
    } catch (error) {
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
