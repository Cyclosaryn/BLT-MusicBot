const { 
  SlashCommandBuilder, 
  ActionRowBuilder, 
  StringSelectMenuBuilder,
  ChannelType,
  PermissionsBitField,
} = require('discord.js');
const fs = require('fs');
const path = require('path');
let OpusEncoder;
const radioListPath = path.join(__dirname, '../radiolist.json');

// Import necessary modules for voice functionality
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  getVoiceConnection,
} = require('@discordjs/voice');
const fetch = require('node-fetch');

try {
  OpusEncoder = require('@discordjs/opus').OpusEncoder;
  console.log('Using @discordjs/opus for encoding.');
} catch (error) {
  OpusEncoder = require('opusscript').OpusEncoder;
  console.log('Using opusscript as fallback for encoding.');
}

// Function to handle and format errors
const handleError = (context, error) => {
  console.error(`Error in ${context}:`, {
    message: error.message,
    stack: error.stack,
  });
};

let radioStations;
try {
  radioStations = JSON.parse(fs.readFileSync(radioListPath, 'utf8'));
  console.log('Successfully loaded radio stations from radiolist.json');
} catch (error) {
  handleError('loading radiolist.json', error);
  process.exit(1);
}

// Use lowercase country keys for consistency
const stationsByCountry = {};
radioStations.forEach((station, index) => {
  if (
    station &&
    station.name &&
    station.url &&
    station.country &&
    typeof station.name === 'string' &&
    typeof station.url === 'string' &&
    typeof station.country === 'string'
  ) {
    const countryKey = station.country.toLowerCase().replace(/\s+/g, '_'); // Replace spaces with underscores
    if (!stationsByCountry[countryKey]) {
      stationsByCountry[countryKey] = [];
    }
    stationsByCountry[countryKey].push(station);
  } else {
    console.error(`Invalid station entry at index ${index}:`, station);
  }
});

// Add "Bootie's Mashup" as a country with a single station
stationsByCountry['booties_mashup'] = [
  {
    name: "Bootie's Mashup",
    url: 'http://c7.radioboss.fm/playlist/205/stream.m3u',
  },
];

// Create maps to store connections and players per guild
const connections = new Map();
const players = new Map();
const pendingVoiceChannelSelections = new Map(); // Map to store pending voice channel selections
const initiatingUsers = new Map(); // Map to keep track of the initiating user per guild

// Build the command
const commandBuilder = new SlashCommandBuilder()
  .setName('playstream')
  .setDescription('Play a radio stream from various countries or a custom URL')
  .addStringOption(option =>
    option.setName('url')
      .setDescription('Provide a custom stream URL to play')
      .setRequired(false)
  );


module.exports = {
  data: commandBuilder,
  async execute(interaction) {
    try {
      const url = interaction.options.getString('url');
      if (url) {
        // User provided a custom URL
        const station = {
          name: 'Custom Stream',
          url: url,
        };
        await handlePlayStream(interaction, station, 'custom_stream');
        return;
      }
  
      // Create a Select Menu for countries
      const countryList = Object.keys(stationsByCountry);
  
      const countryOptions = [
        {
          label: '⭐ Bootie Mashup ⭐',
          value: 'booties_mashup',
        },
        ...countryList
          .filter((country) => country !== 'booties_mashup')
          .map((country) => ({
            label: country.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
            value: country,
          })),
      ];
  
      const countrySelectMenu = new StringSelectMenuBuilder()
        .setCustomId(`playstream_select_country_${interaction.user.id}`)
        .setPlaceholder('Select a country')
        .addOptions(countryOptions);
  
      const row = new ActionRowBuilder().addComponents(countrySelectMenu);
  
      await interaction.reply({
        content: 'Please select a country:',
        components: [row],
        ephemeral: true,
      });
    } catch (error) {
      handleError('execute function', error);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply('An unexpected error occurred. Please try again.');
      } else {
        await interaction.reply('An unexpected error occurred. Please try again.');
      }
    }
  },  

  // Function to handle select menu interactions
  async handleSelectMenu(interaction) {
    const parts = interaction.customId.split('_');
    const action = parts[2]; // Adjusted index due to 'playstream' prefix
    const userId = parts[parts.length - 1]; // Always get the last part

    if (interaction.user.id !== userId) {
      await interaction.reply({
        content: 'This menu is not for you.',
        ephemeral: true,
      });
      return;
    }

    if (interaction.customId.startsWith('playstream_select_country_')) {
      const selectedCountry = interaction.values[0];

      if (selectedCountry === 'booties_mashup') {
        // Directly play Bootie's Mashup station without station selection
        const station = {
          name: "Bootie's Mashup",
          url: 'http://c7.radioboss.fm/playlist/205/stream.m3u',
        };
        await handlePlayStream(interaction, station, selectedCountry);
        return;
      }

      const stations = stationsByCountry[selectedCountry];

      const stationOptions = stations.map((station) => ({
        label: station.name,
        value: station.url,
      }));

      const stationSelectMenu = new StringSelectMenuBuilder()
        .setCustomId(`playstream_select_station_${selectedCountry}_${interaction.user.id}`) // User ID at the end
        .setPlaceholder('Select a station')
        .addOptions(stationOptions);

      const row = new ActionRowBuilder().addComponents(stationSelectMenu);

      await interaction.update({
        content: `You selected **${selectedCountry.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}**. Now select a station:`,
        components: [row],
      });
    } else if (interaction.customId.startsWith('playstream_select_station_')) {
      const selectedStationUrl = interaction.values[0];
      const selectedCountry = parts.slice(3, parts.length - 1).join('_'); // Reconstruct the country name

      let station = stationsByCountry[selectedCountry]?.find(
        (st) => st.url === selectedStationUrl
      );

      if (!station) {
        await interaction.reply({
          content: 'Selected station not found.',
          ephemeral: true,
        });
        return;
      }

      await handlePlayStream(interaction, station, selectedCountry);
    } else if (interaction.customId.startsWith('playstream_select_voice_channel_')) {
      const selectedChannelId = interaction.values[0];
      // User ID is already extracted

      const pendingData = pendingVoiceChannelSelections.get(interaction.user.id);

      if (!pendingData) {
        await interaction.reply({
          content: 'Sorry, something went wrong. Please try again.',
          ephemeral: true,
        });
        return;
      }

      const { station, selectedCountry } = pendingData;

      // Now proceed to join the selected voice channel and play the stream.
      await handlePlayStream(interaction, station, selectedCountry, selectedChannelId);

      // Remove the pending data
      pendingVoiceChannelSelections.delete(interaction.user.id);
    }
  },

  // Voice state update handler
  async handleVoiceStateUpdate(oldState, newState) {
    // Check if the user who initiated the playback left the voice channel
    const guildId = oldState.guild.id;
    const initiatingUser = initiatingUsers.get(guildId);

    // If no initiating user is stored for this guild, do nothing
    if (!initiatingUser) return;

    // If the user who initiated playback disconnected from the voice channel
    if (oldState.id === initiatingUser.userId && !newState.channelId) {
      console.log(`User ${initiatingUser.userId} disconnected from the voice channel.`);

      // Get the current connection and player
      const connection = connections.get(guildId);
      const player = players.get(guildId);

      // Get the bot's current voice channel
      const botMember = oldState.guild.members.cache.get(oldState.client.user.id);
      const botVoiceChannel = botMember.voice.channel;

      if (connection && player && botVoiceChannel) {
        // Switch to Bootie's Mashup station
        const bootiesMashupStation = {
          name: "Bootie's Mashup",
          url: 'http://c7.radioboss.fm/playlist/205/stream.m3u',
        };

        // Update the player to play Bootie's Mashup station
        const playStream = async (stationUrl) => {
          try {
            const streamUrl = await getDirectStreamUrl(stationUrl);

            if (!streamUrl) {
              console.error('Failed to retrieve a valid stream URL for Bootie\'s Mashup station.');
              return;
            }

            console.log('Switching to Bootie\'s Mashup station:', streamUrl);

            const audioResource = createAudioResource(streamUrl, { inlineVolume: true });
            audioResource.volume.setVolume(0.2);
            player.play(audioResource);
          } catch (error) {
            handleError('creating audio resource for Bootie\'s Mashup', error);
          }
        };

        // Send a message to the text channel associated with the voice channel
        const messageContent = `The user who initiated the playback has disconnected. Reverting to ⭐ Bootie's Mashup ⭐ station. Use \`/playstream\` to change the station.`;
        await sendMessageToChannel(
          oldState.guild,
          botVoiceChannel,
          initiatingUser.textChannelId,
          messageContent
        );

        await playStream(bootiesMashupStation.url);

        // Update the initiating user to null
        initiatingUsers.delete(guildId);
      }
    }
  },
};

// Helper function to send messages to the appropriate text channel
// Helper function to send messages to the appropriate text channel
const sendMessageToChannel = async (guild, voiceChannel, fallbackTextChannelId, messageContent) => {
  let textChannel = null;

  // Attempt to find the associated text channel for the voice channel (Voice Channel Chat feature)
  if (voiceChannel) {
    // Check if the voice channel has an associated text channel (Voice Channel Chat)
    if (voiceChannel.type === ChannelType.GuildVoice && voiceChannel.guild.voiceAdapterCreator) {
      // Voice Channel Chat is enabled
      textChannel = voiceChannel.guild.channels.cache.find(
        (channel) =>
          channel.type === ChannelType.GuildVoice &&
          channel.id === voiceChannel.id &&
          channel.permissionsFor(guild.members.me).has(PermissionsBitField.Flags.SendMessages)
      );
    }
  }

  // If no associated text channel, try to find a text channel in the same category
  if (!textChannel && voiceChannel && voiceChannel.parentId) {
    const channelsInCategory = guild.channels.cache.filter(
      (channel) =>
        channel.parentId === voiceChannel.parentId &&
        channel.type === ChannelType.GuildText &&
        channel.permissionsFor(guild.members.me).has(PermissionsBitField.Flags.SendMessages)
    );

    // Get the first available text channel in the category
    textChannel = channelsInCategory.first();
  }

  // If still no text channel found, use the fallback text channel (where the command was invoked)
  if (!textChannel) {
    textChannel = guild.channels.cache.get(fallbackTextChannelId);
  }

  // If still no text channel, use the system channel
  if (!textChannel) {
    textChannel = guild.systemChannel;
  }

  // Send the message if a text channel is available
  if (textChannel && textChannel.isTextBased()) {
    try {
      await textChannel.send(messageContent);
    } catch (error) {
      console.error('Failed to send message to text channel:', error);
    }
  } else {
    console.error('No suitable text channel found to send the message.');
  }
};

// Function to get direct stream URL
// Function to get direct stream URL
const getDirectStreamUrl = async (url) => {
  try {
    const response = await fetch(url);
    const contentType = response.headers.get('content-type') || '';

    if (
      contentType.includes('audio/mpeg') ||
      contentType.includes('application/octet-stream') ||
      contentType.includes('audio/aacp') ||
      contentType.includes('audio/aac')
    ) {
      // Direct stream URL
      return url;
    } else if (
      contentType.includes('audio/x-mpegurl') ||
      contentType.includes('application/vnd.apple.mpegurl') ||
      contentType.includes('audio/mpegurl') ||
      contentType.includes('application/x-mpegurl')
    ) {
      // It's an M3U or M3U8 playlist
      const m3uContent = await response.text();
      const streamUrls = m3uContent
        .split('\n')
        .filter((line) => line && !line.startsWith('#'));

      console.log('Extracted stream URLs from .m3u file:', streamUrls);

      for (const url of streamUrls) {
        if (await fetch(url.trim()).then((res) => res.ok)) {
          return url.trim();
        }
      }

      console.error('No valid URLs found in the .m3u file.');
      return null;
    } else {
      console.error('Unsupported content type:', contentType);
      return null;
    }
  } catch (error) {
    handleError('fetching stream URL', error);
    return null;
  }
};


const handlePlayStream = async (interaction, station, selectedCountry, voiceChannelId = null) => {
  try {
    let voiceChannel;

    if (voiceChannelId) {
      voiceChannel = interaction.guild.channels.cache.get(voiceChannelId);
      if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice) {
        await interaction.reply({
          content: 'Invalid voice channel selected.',
          ephemeral: true,
        });
        return;
      }
    } else {
      voiceChannel = interaction.member.voice.channel;
      if (!voiceChannel) {
        // User is not in a voice channel, prompt them to select one.
        const voiceChannels = interaction.guild.channels.cache.filter(
          (channel) => channel.type === ChannelType.GuildVoice && channel.joinable
        );

        if (!voiceChannels.size) {
          await interaction.reply({
            content: 'No available voice channels to join.',
            ephemeral: true,
          });
          return;
        }

        const voiceChannelOptions = voiceChannels.map((channel) => ({
          label: channel.name,
          value: channel.id,
        }));

        const voiceChannelSelectMenu = new StringSelectMenuBuilder()
          .setCustomId(`playstream_select_voice_channel_${interaction.user.id}`)
          .setPlaceholder('Select a voice channel')
          .addOptions(voiceChannelOptions);

        // Store the station and selectedCountry for later use
        pendingVoiceChannelSelections.set(interaction.user.id, {
          station,
          selectedCountry,
        });

        const row = new ActionRowBuilder().addComponents(voiceChannelSelectMenu);

        await interaction.reply({
          content: 'Please select a voice channel to join:',
          components: [row],
          ephemeral: true,
        });

        return;
      }
    }

    // Store the initiating user and interaction channel
    const guildId = interaction.guild.id;
    initiatingUsers.set(guildId, {
      userId: interaction.user.id,
      voiceChannelId: voiceChannel.id,
      textChannelId: interaction.channel.id,
    });

    await interaction.update({
      content: `Selected station: **${station.name}**. Connecting to voice channel **${voiceChannel.name}**...`,
      components: [],
    });

    // **Define connection and player here**
    // Check if there's an existing connection
    let connection = getVoiceConnection(guildId);

    let player;
    if (connection) {
      console.log('Bot is already connected to a voice channel in this guild.');

      if (connection.joinConfig.channelId !== voiceChannel.id) {
        // Bot is connected to a different channel, move it
        console.log('Moving bot to the new channel.');
        connection.destroy(); // Destroy the old connection
        connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: guildId,
          adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        });
        connections.set(guildId, connection);
      } else {
        console.log('Bot is already in the requested channel.');
      }

      // Get the existing player or create a new one
      player = players.get(guildId);
      if (!player) {
        player = createAudioPlayer();
        players.set(guildId, player);
      }
    } else {
      // No existing connection, create a new one
      console.log('Bot is not connected. Joining the channel.');
      connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: guildId,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      });
      connections.set(guildId, connection);

      // Create a new player
      player = createAudioPlayer();
      players.set(guildId, player);
    }

    // Play stream function (updated)
    const playStream = async (stationUrl) => {
      try {
        console.log('Attempting to stream station:', station.name, 'with URL:', stationUrl);
    
        const streamUrl = await getDirectStreamUrl(stationUrl);
    
        if (!streamUrl) {
          throw new Error('Failed to retrieve a valid stream URL.');
        }
    
        console.log('Resolved stream URL:', streamUrl);
    
        const audioResource = createAudioResource(streamUrl, { inlineVolume: true });
        audioResource.volume.setVolume(0.2);
        player.play(audioResource);
      } catch (error) {
        handleError('creating audio resource', error);
    
        // If the station is the custom stream or failed station, revert to Bootie's Mashup
        if (selectedCountry === 'custom_stream' || selectedCountry) {
          await interaction.followUp({
            content: `Failed to play **${station.name}**. Reverting to Bootie's Mashup station.`,
            ephemeral: true,
          });
    
          // Update station to Bootie's Mashup and retry
          const bootiesMashupStation = {
            name: "Bootie's Mashup",
            url: 'http://c7.radioboss.fm/playlist/205/stream.m3u',
          };
          station = bootiesMashupStation; // Update the station variable
          selectedCountry = 'booties_mashup'; // Update selectedCountry if necessary
    
          // Update initiatingUsers map
          initiatingUsers.set(interaction.guild.id, {
            userId: interaction.user.id,
            voiceChannelId: voiceChannel.id,
            textChannelId: interaction.channel.id,
          });
    
          // Retry playing with the updated station
          await playStream(station.url);
          return;
        } else {
          await interaction.followUp({
            content: 'An error occurred while attempting to play the stream.',
            ephemeral: true,
          });
        }
      }
    };    

    // Subscribe the connection to the player (if not already subscribed)
    if (!connection.state.subscription || connection.state.subscription.player !== player) {
      connection.subscribe(player);
    }

    // Register player events if not already registered
    if (!player.listenerCount(AudioPlayerStatus.Playing)) {
      player.on(AudioPlayerStatus.Playing, () => {
        console.log('Audio is now playing!');
      });

      player.on(AudioPlayerStatus.Idle, () => {
        console.log('Audio Player is idle. Restarting stream...');
        setTimeout(() => playStream(station.url), 2000);
      });

      player.on('error', async (error) => {
        handleError('Audio Player Error', error);
        await interaction.followUp({
          content: 'An error occurred while streaming audio. Retrying...',
          ephemeral: true,
        });
        setTimeout(() => playStream(station.url), 5000);
      });
    }

    // Handle connection events if not already handled
    if (!connection.listenerCount(VoiceConnectionStatus.Disconnected)) {
      connection.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
          await Promise.race([
            entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
            entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
          ]);
        } catch (error) {
          console.log('Connection lost. Destroying connection.');
          connection.destroy();
          connections.delete(guildId);
          players.delete(guildId);
          initiatingUsers.delete(guildId);
          setTimeout(async () => {
            console.log('Attempting to reconnect...');
            const newConnection = joinVoiceChannel({
              channelId: voiceChannel.id,
              guildId: guildId,
              adapterCreator: voiceChannel.guild.voiceAdapterCreator,
            });
            connections.set(guildId, newConnection);
            newConnection.subscribe(player);
            await playStream(station.url);
          }, 5000);
        }
      });
    }

    // Start playing the stream
    await playStream(station.url);
  } catch (error) {
    handleError('handlePlayStream function', error);
    await interaction.followUp({
      content: 'An unexpected error occurred. Please try again.',
      ephemeral: true,
    });
  }
};
