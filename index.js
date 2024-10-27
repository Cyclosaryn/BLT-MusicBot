const fs = require('fs');
const path = require('path');
const express = require('express'); // Import Express
const { Client, Collection, Events, GatewayIntentBits } = require('discord.js');
const { token } = require('./config.json');

// Add GUILD_VOICE_STATES to the intents
const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildVoiceStates, // Required for voice functionality
	],
});

client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
	const filePath = path.join(commandsPath, file);
	const command = require(filePath);
	client.commands.set(command.data.name, command);
}

client.once(Events.ClientReady, () => {
	console.log(`Ready! Logged in as ${client.user.tag}`);
});

client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isChatInputCommand()) return;

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
});

// Create an Express app and bind it to the specified port (process.env.PORT or a fallback port like 3000)
const app = express();
const WEBSITES_PORT = process.env.WEBSITES_PORT || 8080;

app.get('/', (req, res) => {
	res.send("I'm alive! Yay!");
});

app.listen(WEBSITES_PORT, () => {
	console.log(`Server is running on port ${WEBSITES_PORT}`);
});

client.login(token);
