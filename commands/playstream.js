const { SlashCommandBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
const fetch = require('node-fetch');
const { OpusEncoder } = require('@discordjs/opus'); // Import @discordjs/opus

module.exports = {
  data: new SlashCommandBuilder()
    .setName('playstream')
    .setDescription('Join a voice channel and play a 24/7 music stream')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('The voice channel to join')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('url')
        .setDescription('The stream URL to play')
        .setRequired(false)),

  async execute(interaction) {
    const channel = interaction.options.getChannel('channel');
    const inputUrl = interaction.options.getString('url') || 'http://c7.radioboss.fm/playlist/205/stream.m3u';

    if (!channel || (channel.type !== 2 && channel.type !== 13)) {
      await interaction.reply('Please select a valid voice channel.');
      return;
    }

    // Check if the provided URL is an .m3u file
    if (!inputUrl.endsWith('.m3u')) {
      await interaction.reply('Please provide a valid .m3u URL. This bot currently only supports streaming from .m3u playlist URLs.');
      return;
    }

    await interaction.deferReply();

    if (!interaction.options.getString('url')) {
      await interaction.editReply(`No URL provided. Using default stream: ${inputUrl}`);
    }

    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
    });

    const player = createAudioPlayer();

    // Fetch the direct stream URL from the .m3u file if provided
    const getDirectStreamUrl = async (url) => {
      try {
        const response = await fetch(url);
        const m3uContent = await response.text();
        const streamUrls = m3uContent.split('\n').filter(line => line && !line.startsWith('#'));

        console.log('Extracted stream URLs from .m3u file:', streamUrls);

        for (const url of streamUrls) {
          if (await fetch(url.trim()).then(res => res.ok)) {
            return url.trim();
          }
        }

        console.error('No valid URLs found in the .m3u file.');
        return null;
      } catch (error) {
        console.error('Error fetching the stream URL from .m3u file:', error);
        return null;
      }
    };

    const playStream = async () => {
      const streamUrl = await getDirectStreamUrl(inputUrl);

      if (!streamUrl) {
        await interaction.editReply('Failed to retrieve a valid stream URL from the provided .m3u file or no valid URLs found.');
        return;
      }

      console.log('Attempting to stream:', streamUrl);

      try {
        // Create the audio resource using the stream URL
        const audioResource = createAudioResource(streamUrl, { inlineVolume: true });
        audioResource.volume.setVolume(0.5); // Set to a balanced volume level to avoid distortion
        player.play(audioResource);
      } catch (error) {
        console.error('Error creating audio resource:', error);
        await interaction.editReply('An error occurred while attempting to play the stream.');
        return;
      }
    };

    player.on(AudioPlayerStatus.Playing, () => {
      console.log('Audio is now playing!');
    });

    player.on(AudioPlayerStatus.Idle, () => {
      console.log('Audio Player is idle. Restarting stream...');
      setTimeout(playStream, 2000); // Restart on idle
    });

    player.on('error', async error => {
      console.error('Audio Player Error:', error);
      await interaction.editReply('An error occurred while streaming audio. Retrying...');
      setTimeout(playStream, 5000); // Retry after error
    });

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch (error) {
        console.log('Connection lost. Destroying connection.');
        connection.destroy();
        setTimeout(async () => {
          console.log('Attempting to reconnect...');
          connection.subscribe(player);
          await playStream();
        }, 5000);
      }
    });

    connection.subscribe(player);
    await playStream();
    await interaction.editReply(`Now playing stream in ${channel.name}! URL: ${inputUrl}`);
  },
};
