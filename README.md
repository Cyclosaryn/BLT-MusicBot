# 🎵 BLT - MusicBot 🎵

BLT - MusicBot is a Discord bot designed to play radio streams in voice channels. It supports various radio stations from different countries and allows users to provide custom stream URLs.

## Features

- Play radio streams from a predefined list of stations.
- Support for custom stream URLs.
- Interactive command to select and play streams.
- Error handling and fallback mechanisms for voice encoding.
- Deployable to Azure Web App using GitHub Actions.

## Prerequisites

- Node.js (version 18.x)
- npm (Node Package Manager)
- Discord bot token
- Azure Web App publish profile

## Installation

1. Clone the repository:
    ```sh
    git clone https://github.com/yourusername/BLT-MusicBot.git
    cd BLT-MusicBot
    ```

2. Install dependencies:
    ```sh
    npm install
    ```

3. Create a `config.json` file in the root directory with the following structure:
    ```json
    {
      "clientId": "YOUR_DISCORD_CLIENT_ID",
      "guildIds": ["YOUR_GUILD_ID_1", "YOUR_GUILD_ID_2"],
      "token": "YOUR_DISCORD_BOT_TOKEN"
    }
    ```

4. Add your radio stations to `radiolist.json`.

## Usage

1. Start the bot:
    ```sh
    node index.js
    ```

2. Deploy commands to your Discord server:
    ```sh
    node deploy-commands.js
    ```

3. Interact with the bot using the `/playstream` and `/help` commands in your Discord server.

## Deployment

This project uses GitHub Actions to deploy to an Azure Web App. The workflow is defined in [`.github/workflows/main_blt-musicbot.yml`](.github/workflows/main_blt-musicbot.yml).

1. Set up your Azure Web App and obtain the publish profile.
2. Add the publish profile as a secret in your GitHub repository (`AZUREAPPSERVICE_PUBLISHPROFILE_DF8562C11DC242F8A14EB4F29AEF2466`).
3. Push changes to the `main` branch to trigger the deployment workflow.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

This project is licensed under the MIT License.
