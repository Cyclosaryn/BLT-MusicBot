const { SlashCommandBuilder } = require('discord.js');
const { EmbedBuilder } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('help')
		.setDescription('Shows a list with all available commands.'),
	async execute(interaction) {
		const embed = new EmbedBuilder()
            .setColor(0x0099FF)
			.setTitle('Lijst van commando\'s')
            .setAuthor({ name: 'Cyclosarin', iconURL: 'https://i.ibb.co/mCJFKrH/Discord-Picture.jpg', url: 'https://discord.com/users/269195416963121152' })
			.setDescription('This is a list with all currently available commands.')
			.addFields(
                { name: '/playstream', value: 'Allows to set a voice channel and a stream to play that stream in.' },
				{ name: '/help', value: 'Shows this list' },
            )
            .setTimestamp()
			.setFooter({ text: '© 🎵BLT - MusicBot🎵 by Cyclosarin', iconURL: 'https://cdn.discordapp.com/app-icons/1195694045519945748/29e47d0d61763734c3118312cf44f516.webp?size=96' });

		await interaction.reply({ embeds: [embed] });
	},
};
