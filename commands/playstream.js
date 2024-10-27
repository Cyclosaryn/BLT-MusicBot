const { SlashCommandBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
const fetch = require('node-fetch');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

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

    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
    });

    const player = createAudioPlayer();

    // Fetch the stream URL from the .m3u file if needed
    const getDirectStreamUrl = async (url) => {
      if (!url.endsWith('.m3u')) return url;

      try {
        const response = await fetch(url);
        const m3uContent = await response.text();
        const streamUrls = m3uContent.split('\n').filter(line => line && !line.startsWith('#'));

        console.log('Extracted stream URLs from .m3u file:', streamUrls);
        
        // Log all extracted URLs and return the first valid one
        for (const url of streamUrls) {
          console.log('Testing extracted URL:', url.trim());
          // Return the first URL that doesn't yield a 404 error (basic validation)
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
        await interaction.followUp('Failed to retrieve a valid stream URL.');
        return;
      }

      console.log('Attempting to stream:', streamUrl);

      const audioResource = createAudioResource(
        ffmpeg(streamUrl)
          .setFfmpegPath(ffmpegPath)
          .audioCodec('libopus')
          .format('opus')
          .pipe(),
        { inlineVolume: true }
      );

      audioResource.volume.setVolume(0.1); // Set volume to 100%
      player.play(audioResource);
    };

    player.on(AudioPlayerStatus.Playing, () => {
      console.log('Audio is now playing!');
    });

    player.on(AudioPlayerStatus.Idle, () => {
      console.log('Audio Player is idle. Restarting stream...');
      playStream();
    });

    player.on('error', error => {
      console.error('Audio Player Error:', error);
      setTimeout(playStream, 5000); // Retry after error
    });

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch (error) {
        console.log('Connection failed. Destroying connection.');
        connection.destroy();
      }
    });

    connection.subscribe(player);

    await playStream(); // Start playing immediately
    await interaction.reply(`Now playing stream in ${channel.name}! URL: ${inputUrl}`);
  },
};