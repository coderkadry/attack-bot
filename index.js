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
      const res = await fetch(`${API_BASE}/get-link/${discordId}`);
      const text = await res.text();

      if (!res.ok) {
        throw new Error(`API ${res.status}: ${text}`);
      }

      const linkData = JSON.parse(text);
      const robloxId = linkData.robloxId;

      if (!robloxId) {
        const embed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('❌ No Roblox ID linked')
          .setDescription('Use `/register` to link your Roblox account first.');
        return await interaction.editReply({ embeds: [embed] });
      }

      const balRes = await fetch(`${API_BASE}/get-balance/${robloxId}`);
      const balText = await balRes.text();

      if (!balRes.ok) {
        throw new Error(`API ${balRes.status}: ${balText}`);
      }

      const balData = JSON.parse(balText);
      if (typeof balData.balance !== 'number') {
        throw new Error(`Invalid balance format: ${balText}`);
      }

      const embed = new EmbedBuilder()
        .setColor(0x00FF99)
        .setTitle('💰 Your Balance')
        .setDescription(`Roblox ID: **${robloxId}**\nBalance: **${balData.balance}**`)
        .setFooter({ text: 'Powered by Attack Roblox' });

      await interaction.editReply({ embeds: [embed] });
    }

    if (command === 'register') {
      const userId = interaction.options.getString('userid');

      const res = await fetch(`${API_BASE}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discordId, robloxId: userId }),
      });

      const text = await res.text();

      if (!res.ok) {
        throw new Error(`API ${res.status}: ${text}`);
      }

      const embed = new EmbedBuilder()
        .setColor(0x00AAFF)
        .setTitle('✅ Roblox ID Linked')
        .setDescription(`Your Discord is now linked with Roblox ID **${userId}**.\nYou can now use \`/bal\`.`)
        .setFooter({ text: 'You can re-register at any time.' });

      await interaction.editReply({ embeds: [embed] });
    }

  } catch (err) {
    console.error('❌ Error:', err.message);

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
