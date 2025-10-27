require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use(express.static('public'));

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

// Generate random string for state parameter
function generateRandomString(length) {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

// Login route - redirects to Spotify authorization
app.get('/login', (req, res) => {
  const state = generateRandomString(16);
  const scope = 'playlist-read-private playlist-modify-private playlist-modify-public';

  const authUrl = 'https://accounts.spotify.com/authorize?' +
    new URLSearchParams({
      response_type: 'code',
      client_id: CLIENT_ID,
      scope: scope,
      redirect_uri: REDIRECT_URI,
      state: state
    });

  res.redirect(authUrl);
});

// Callback route - exchanges code for access token
app.get('/callback', async (req, res) => {
  const code = req.query.code || null;
  const state = req.query.state || null;

  if (state === null) {
    res.redirect('/#error=state_mismatch');
    return;
  }

  try {
    const response = await axios.post(
      'https://accounts.spotify.com/api/token',
      new URLSearchParams({
        code: code,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code'
      }),
      {
        headers: {
          'Authorization': 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const { access_token, refresh_token } = response.data;

    res.redirect('/#' +
      new URLSearchParams({
        access_token: access_token,
        refresh_token: refresh_token
      })
    );
  } catch (error) {
    console.error('Error getting token:', error.response?.data || error.message);
    res.redirect('/#error=invalid_token');
  }
});

// Get user's playlists
app.get('/api/playlists', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    let allPlaylists = [];
    let url = 'https://api.spotify.com/v1/me/playlists?limit=50';

    while (url) {
      const response = await axios.get(url, {
        headers: { 'Authorization': 'Bearer ' + token }
      });

      allPlaylists = allPlaylists.concat(response.data.items);
      url = response.data.next;
    }

    res.json(allPlaylists);
  } catch (error) {
    console.error('Error fetching playlists:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch playlists' });
  }
});

// Get tracks from a playlist
app.get('/api/playlist/:playlistId/tracks', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const playlistId = req.params.playlistId;

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    let allTracks = [];
    let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;

    while (url) {
      const response = await axios.get(url, {
        headers: { 'Authorization': 'Bearer ' + token }
      });

      allTracks = allTracks.concat(response.data.items);
      url = response.data.next;
    }

    res.json(allTracks);
  } catch (error) {
    console.error('Error fetching tracks:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch tracks' });
  }
});

// Find duplicates in playlists
app.post('/api/find-duplicates', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const { playlistIds } = req.body;

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  if (!playlistIds || !Array.isArray(playlistIds)) {
    return res.status(400).json({ error: 'Invalid playlist IDs' });
  }

  try {
    const duplicates = {};

    for (const playlistId of playlistIds) {
      let allTracks = [];
      let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;

      while (url) {
        const response = await axios.get(url, {
          headers: { 'Authorization': 'Bearer ' + token }
        });

        allTracks = allTracks.concat(response.data.items);
        url = response.data.next;
      }

      // Find duplicates by track URI
      const trackMap = new Map();
      const playlistDuplicates = [];

      allTracks.forEach((item, index) => {
        if (!item.track || !item.track.uri) return;

        const trackUri = item.track.uri;
        const trackId = item.track.id;

        if (trackMap.has(trackUri)) {
          const original = trackMap.get(trackUri);
          playlistDuplicates.push({
            trackId: trackId,
            trackUri: trackUri,
            trackName: item.track.name,
            artists: item.track.artists.map(a => a.name).join(', '),
            position: index,
            originalPosition: original.position
          });
        } else {
          trackMap.set(trackUri, { position: index, trackId: trackId });
        }
      });

      if (playlistDuplicates.length > 0) {
        duplicates[playlistId] = playlistDuplicates;
      }
    }

    res.json(duplicates);
  } catch (error) {
    console.error('Error finding duplicates:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to find duplicates' });
  }
});

// Remove duplicates from a playlist
app.post('/api/remove-duplicates', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const { playlistId, duplicates } = req.body;

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  if (!playlistId || !duplicates || !Array.isArray(duplicates)) {
    return res.status(400).json({ error: 'Invalid request data' });
  }

  try {
    // Spotify API requires tracks to be removed with their positions
    // We need to sort by position in descending order to avoid index shifting
    const sortedDuplicates = duplicates.sort((a, b) => b.position - a.position);

    // Batch remove tracks (Spotify allows up to 100 tracks per request)
    const batchSize = 100;
    let removedCount = 0;

    for (let i = 0; i < sortedDuplicates.length; i += batchSize) {
      const batch = sortedDuplicates.slice(i, i + batchSize);

      const tracks = batch.map(dup => ({
        uri: dup.trackUri,
        positions: [dup.position]
      }));

      await axios.delete(
        `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
        {
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
          },
          data: { tracks }
        }
      );

      removedCount += batch.length;
    }

    res.json({ success: true, removedCount });
  } catch (error) {
    console.error('Error removing duplicates:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to remove duplicates' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
