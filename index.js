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

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = '1386338165916438538';
const GUILD_ID = '1380367982986793010';
const API_BASE = 'https://attack-roblox-api-135053415446.europe-west3.run.app';

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
      
      const res = await fetch(`${API_BASE}/get-link/${discordId}`);
      const text = await res.text();
      
      console.log(`📡 Link API Response: ${res.status} - ${text}`);

      if (!res.ok) {
        if (res.status === 404) {
          const embed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('❌ You are not registered')
            .setDescription('Use /register to link your Roblox UserId first.');
          return await interaction.editReply({ embeds: [embed] });
        }
        throw new Error(`API ${res.status}: ${text}`);
      }

      const linkData = JSON.parse(text);
      const robloxId = linkData.robloxId;
      
      console.log(`🎮 Found linked Roblox ID: ${robloxId}`);

      if (!robloxId) {
        const embed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('❌ No Roblox ID linked')
          .setDescription('Please register first using /register.');
        return await interaction.editReply({ embeds: [embed] });
      }

      const balRes = await fetch(`${API_BASE}/get-balance/${robloxId}`);
      const balText = await balRes.text();
      
      console.log(`💰 Balance API Response: ${balRes.status} - ${balText}`);

      if (!balRes.ok) {
        if (balRes.status === 404) {
          const embed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('❌ Roblox user not found')
            .setDescription('Please re-register with the correct ID.');
          return await interaction.editReply({ embeds: [embed] });
        }
        throw new Error(`API ${balRes.status}: ${balText}`);
      }

      const balData = JSON.parse(balText);
      if (typeof balData.balance !== 'number') {
        throw new Error(`Invalid balance response: ${balText}`);
      }

      const embed = new EmbedBuilder()
        .setColor(0x00FF99)
        .setTitle('💰 Your Balance')
        .setDescription(`Roblox ID: **${robloxId}**\nBalance: **${balData.balance}**`)
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
      
      // Test 2: Check available endpoints
      const testEndpoints = [
        '/register',
        '/link', 
        '/create-user',
        '/add-user',
        '/users',
        '/health',
        '/status'
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
      
      // Test 3: Try POST to different endpoints
      const testData = { discordId: '123', robloxId: '456' };
      for (const endpoint of ['/register', '/link', '/create-user']) {
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
      
      console.log(`📝 Attempting to register Discord ID: ${discordId} with Roblox ID: ${userId}`);

      // Step 1: Check if the user already exists and get balance
      let existingBalance = null;
      try {
        const balanceRes = await fetch(`${API_BASE}/get-balance/${userId}`);
        if (balanceRes.ok) {
          const balanceData = JSON.parse(await balanceRes.text());
          existingBalance = balanceData.balance;
          console.log(`✅ User exists with balance: ${existingBalance}`);
        } else {
          console.log(`ℹ️ User doesn't exist yet (${balanceRes.status})`);
        }
      } catch (err) {
        console.log(`⚠️ Balance check failed: ${err.message}`);
      }

      // Step 2: Try to register/link the user
      let success = false;
      let errorDetails = [];

      // Method 1: Standard registration
      try {
        console.log('🔄 Trying Method 1: POST /register');
        const res = await fetch(`${API_BASE}/register`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ 
            discordId: discordId,
            robloxId: userId 
          }),
        });
        
        const responseText = await res.text();
        console.log(`📡 Method 1 Response: ${res.status} - ${responseText}`);
        
        if (res.ok) {
          success = true;
          console.log('✅ Registration successful with Method 1');
        } else {
          errorDetails.push(`Method 1 (POST /register): ${res.status} - ${responseText}`);
        }
      } catch (err) {
        errorDetails.push(`Method 1 Error: ${err.message}`);
        console.log(`❌ Method 1 failed: ${err.message}`);
      }

      // Method 2: Try different endpoint
      if (!success) {
        try {
          console.log('🔄 Trying Method 2: POST /link-discord');
          const res = await fetch(`${API_BASE}/link-discord`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify({ 
              discordId: discordId,
              robloxId: userId 
            }),
          });
          
          const responseText = await res.text();
          console.log(`📡 Method 2 Response: ${res.status} - ${responseText}`);
          
          if (res.ok) {
            success = true;
            console.log('✅ Registration successful with Method 2');
          } else {
            errorDetails.push(`Method 2 (POST /link-discord): ${res.status} - ${responseText}`);
          }
        } catch (err) {
          errorDetails.push(`Method 2 Error: ${err.message}`);
          console.log(`❌ Method 2 failed: ${err.message}`);
        }
      }

      // Method 3: Try with PUT method
      if (!success) {
        try {
          console.log('🔄 Trying Method 3: PUT /register');
          const res = await fetch(`${API_BASE}/register`, {
            method: 'PUT',
            headers: { 
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify({ 
              discordId: discordId,
              robloxId: userId 
            }),
          });
          
          const responseText = await res.text();
          console.log(`📡 Method 3 Response: ${res.status} - ${responseText}`);
          
          if (res.ok) {
            success = true;
            console.log('✅ Registration successful with Method 3');
          } else {
            errorDetails.push(`Method 3 (PUT /register): ${res.status} - ${responseText}`);
          }
        } catch (err) {
          errorDetails.push(`Method 3 Error: ${err.message}`);
          console.log(`❌ Method 3 failed: ${err.message}`);
        }
      }

      if (success) {
        const embed = new EmbedBuilder()
          .setColor(0x00AAFF)
          .setTitle('✅ Registration Successful!')
          .setDescription(`Your Discord account has been linked to Roblox ID: **${userId}**\n\n${existingBalance !== null ? `Current Balance: **${existingBalance}**` : 'Starting Balance: **0**'}\n\nYou can now use \`/bal\` to check your balance!`)
          .setFooter({ text: 'Registration completed successfully' });

        await interaction.editReply({ embeds: [embed] });
      } else {
        console.log('❌ All registration methods failed');
        console.log('📋 Error details:', errorDetails);
        
        const embed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('❌ Registration Failed')
          .setDescription(`Unable to register with any available method.\n\n**Roblox ID:** ${userId}\n**Discord ID:** ${discordId}\n\nUse \`/debug\` to check API status, or contact an administrator.\n\n\`\`\`${errorDetails.slice(0, 3).join('\n')}\`\`\``)
          .setFooter({ text: 'Check console logs for full details' });

        await interaction.editReply({ embeds: [embed] });
      }
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
