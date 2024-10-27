const { REST, Routes } = require('discord.js');
const { clientId, guildIds, token } = require('./config.json');
const fs = require('fs');
const path = require('path');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

// Load commands
for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    commands.push(command.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(token);

// Deploy commands for each guild
(async () => {
    for (const guildId of guildIds) {
        try {
            console.log(`Started refreshing ${commands.length} application (/) commands for guild ${guildId}.`);

            const data = await rest.put(
                Routes.applicationGuildCommands(clientId, guildId),
                { body: commands }
            );

            console.log(`Successfully reloaded ${data.length} application (/) commands for guild ${guildId}.`);
        } catch (error) {
            if (error.code === 50001) {
                console.warn(`Skipping guild ${guildId} due to missing access.`);
            } else {
                console.error(`Failed to deploy commands for guild ${guildId}:`, error);
            }
        }
    }
})();
