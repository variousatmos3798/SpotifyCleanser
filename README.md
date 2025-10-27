# Spotify Cleanser

A web-based application that helps you remove duplicate songs from your Spotify playlists with ease.

## Features

- Spotify OAuth authentication
- Browse and select multiple playlists
- Automatically detect duplicate tracks across playlists
- Remove duplicates with a single click
- Clean, modern user interface
- Real-time progress updates

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- A Spotify account
- Spotify Developer credentials (Client ID and Client Secret)

## Setup Instructions

### 1. Get Spotify API Credentials

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Log in with your Spotify account
3. Click "Create an App"
4. Fill in the app name and description
5. Once created, you'll see your **Client ID** and **Client Secret**
6. Click "Edit Settings" and add `http://localhost:3000/callback` to the Redirect URIs
7. Save the settings

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add your Spotify credentials:
   ```
   SPOTIFY_CLIENT_ID=your_client_id_here
   SPOTIFY_CLIENT_SECRET=your_client_secret_here
   REDIRECT_URI=http://localhost:3000/callback
   PORT=3000
   ```

### 4. Run the Application

Start the server:
```bash
npm start
```

For development with auto-restart:
```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## Usage

1. **Login**: Click the "Login with Spotify" button to authenticate
2. **Select Playlists**: Choose one or more playlists you want to clean
3. **Find Duplicates**: Click "Find Duplicates" to scan selected playlists
4. **Review**: See all duplicate tracks found across your playlists
5. **Remove**: Click "Remove All Duplicates" to clean your playlists

## How It Works

The app identifies duplicates by comparing track URIs (Spotify's unique identifiers for tracks). When duplicates are found, it keeps the first occurrence and removes subsequent duplicates from each playlist.

## Technology Stack

- **Backend**: Node.js, Express
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **API**: Spotify Web API
- **Authentication**: OAuth 2.0

## API Endpoints

- `GET /login` - Initiates Spotify OAuth flow
- `GET /callback` - OAuth callback handler
- `GET /api/playlists` - Fetches user's playlists
- `GET /api/playlist/:playlistId/tracks` - Fetches tracks from a playlist
- `POST /api/find-duplicates` - Finds duplicates in selected playlists
- `POST /api/remove-duplicates` - Removes duplicates from a playlist

## Security Notes

- Never commit your `.env` file
- Keep your Client Secret secure
- The app requires playlist modification permissions
- Review duplicates before removing them (the action is irreversible)

## Troubleshooting

### "Invalid token" error
- Make sure your Spotify API credentials are correct in `.env`
- Verify the redirect URI matches exactly in both `.env` and Spotify Dashboard

### No playlists showing
- Ensure you've granted the necessary permissions during login
- Check that your Spotify account has playlists

### Duplicates not being removed
- Verify you have edit permissions for the playlist
- Check that the playlist isn't collaborative (if you're not the owner)

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Disclaimer

This app modifies your Spotify playlists. While it only removes duplicate tracks, please review the duplicates before confirming removal. The developers are not responsible for any unintended changes to your playlists.
