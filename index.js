const fs = require('fs');
const path = require('path');
const express = require('express');
const { 
  Client, 
  Collection, 
  Events, 
  GatewayIntentBits,
} = require('discord.js');
const { token } = require('./config.json');

// Add necessary intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates, // Required for voice functionality
  ],
});

client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

// Load command files
for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  client.commands.set(command.data.name, command);
}

// Event when the bot is ready
client.once(Events.ClientReady, () => {
  console.log(`Ready! Logged in as ${client.user.tag}`);
});

// Interaction handler
client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);

    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(error);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
      } else {
        await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
      }
    }
  } else if (interaction.isStringSelectMenu()) {
    // Delegate select menu interactions to command-specific handlers
    const customIdParts = interaction.customId.split('_');
    const commandName = customIdParts[0]; // Assuming customId starts with the command name
    const command = client.commands.get(commandName);

    if (command && typeof command.handleSelectMenu === 'function') {
      try {
        await command.handleSelectMenu(interaction);
      } catch (error) {
        console.error(error);
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: 'There was an error while handling this interaction!', ephemeral: true });
        } else {
          await interaction.reply({ content: 'There was an error while handling this interaction!', ephemeral: true });
        }
      }
    } else {
      await interaction.reply({ content: 'Unknown interaction.', ephemeral: true });
    }
  }
});

// Register voiceStateUpdate event handler from playstream.js
const playstream = require('./commands/playstream.js');
if (typeof playstream.handleVoiceStateUpdate === 'function') {
  client.on('voiceStateUpdate', playstream.handleVoiceStateUpdate);
}

// Create an Express app (optional, if needed)
const app = express();
const WEBSITES_PORT = process.env.WEBSITES_PORT || 8080;

app.get('/', (req, res) => {
  res.send("I'm alive! Yay!");
});

app.listen(WEBSITES_PORT, () => {
  console.log(`Server is running on port ${WEBSITES_PORT}`);
});

client.login(token);
