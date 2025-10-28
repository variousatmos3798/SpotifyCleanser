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
    // First, collect ALL tracks from ALL playlists with their locations
    const allPlaylistTracks = {};
    const globalTrackMap = new Map(); // Track URI -> array of {playlistId, position, trackName, artists}

    // Fetch tracks from all playlists
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

      allPlaylistTracks[playlistId] = allTracks;

      // Build global track map to find tracks across all playlists
      allTracks.forEach((item, index) => {
        if (!item.track || !item.track.uri) return;

        const trackUri = item.track.uri;
        const trackInfo = {
          playlistId: playlistId,
          position: index,
          trackName: item.track.name,
          artists: item.track.artists.map(a => a.name).join(', '),
          trackId: item.track.id
        };

        if (!globalTrackMap.has(trackUri)) {
          globalTrackMap.set(trackUri, []);
        }
        globalTrackMap.get(trackUri).push(trackInfo);
      });
    }

    // Analyze cross-playlist duplicates and statistics
    const duplicates = {};
    const crossPlaylistDuplicates = [];
    let totalUniqueTracks = 0;
    let totalTracks = 0;
    const playlistNames = {};

    // Get playlist names
    for (const playlistId of playlistIds) {
      const response = await axios.get(`https://api.spotify.com/v1/playlists/${playlistId}`, {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      playlistNames[playlistId] = response.data.name;
    }

    globalTrackMap.forEach((occurrences, trackUri) => {
      totalUniqueTracks++;
      totalTracks += occurrences.length;

      // If track appears in multiple playlists, it's a cross-playlist duplicate
      if (occurrences.length > 1) {
        const playlistsWithTrack = occurrences.map(occ => playlistNames[occ.playlistId]);
        crossPlaylistDuplicates.push({
          trackName: occurrences[0].trackName,
          artists: occurrences[0].artists,
          appearsIn: playlistsWithTrack,
          occurrenceCount: occurrences.length
        });
      }

      // Group by playlist to find within-playlist duplicates
      const byPlaylist = {};
      occurrences.forEach(occ => {
        if (!byPlaylist[occ.playlistId]) {
          byPlaylist[occ.playlistId] = [];
        }
        byPlaylist[occ.playlistId].push(occ);
      });

      // Mark within-playlist duplicates
      Object.entries(byPlaylist).forEach(([playlistId, instances]) => {
        if (instances.length > 1) {
          const duplicateInstances = instances.slice(1);

          if (!duplicates[playlistId]) {
            duplicates[playlistId] = [];
          }

          duplicateInstances.forEach(dup => {
            duplicates[playlistId].push({
              trackId: dup.trackId,
              trackUri: trackUri,
              trackName: dup.trackName,
              artists: dup.artists,
              position: dup.position,
              originalPosition: instances[0].position
            });
          });
        }
      });
    });

    res.json({
      duplicates,
      statistics: {
        totalUniqueTracks,
        totalTracks,
        crossPlaylistDuplicates: crossPlaylistDuplicates.length,
        duplicateSongs: crossPlaylistDuplicates.sort((a, b) => b.occurrenceCount - a.occurrenceCount).slice(0, 20)
      }
    });
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

// Consolidate playlists into a new playlist with optional audio feature filtering
app.post('/api/consolidate-playlists', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const { playlistIds, newPlaylistName, audioFilters } = req.body;

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  if (!playlistIds || !Array.isArray(playlistIds) || !newPlaylistName) {
    return res.status(400).json({ error: 'Invalid request data' });
  }

  try {
    // Get user ID
    const userResponse = await axios.get('https://api.spotify.com/v1/me', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const userId = userResponse.data.id;

    // Create new playlist
    const createPlaylistResponse = await axios.post(
      `https://api.spotify.com/v1/users/${userId}/playlists`,
      {
        name: newPlaylistName,
        description: 'Consolidated playlist created by Spotify Cleanser',
        public: false
      },
      {
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        }
      }
    );

    const newPlaylistId = createPlaylistResponse.data.id;

    // Collect all unique tracks from selected playlists
    const uniqueTracks = new Set();
    const trackDetails = [];

    for (const playlistId of playlistIds) {
      let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;

      while (url) {
        const response = await axios.get(url, {
          headers: { 'Authorization': 'Bearer ' + token }
        });

        response.data.items.forEach(item => {
          if (item.track && item.track.uri && !uniqueTracks.has(item.track.uri)) {
            uniqueTracks.add(item.track.uri);
            trackDetails.push({
              uri: item.track.uri,
              id: item.track.id,
              name: item.track.name,
              artists: item.track.artists.map(a => a.name).join(', ')
            });
          }
        });

        url = response.data.next;
      }
    }

    let filteredTracks = trackDetails;

    // Apply audio feature filtering if specified
    if (audioFilters && (audioFilters.minEnergy || audioFilters.maxEnergy || audioFilters.minTempo || audioFilters.maxTempo || audioFilters.minValence || audioFilters.maxValence)) {
      const trackIds = trackDetails.map(t => t.id).filter(id => id);

      // Fetch audio features in batches of 100
      const audioFeatures = [];
      for (let i = 0; i < trackIds.length; i += 100) {
        const batch = trackIds.slice(i, i + 100);
        const featuresResponse = await axios.get(
          `https://api.spotify.com/v1/audio-features?ids=${batch.join(',')}`,
          {
            headers: { 'Authorization': 'Bearer ' + token }
          }
        );
        audioFeatures.push(...featuresResponse.data.audio_features);
      }

      // Filter tracks based on audio features
      filteredTracks = trackDetails.filter((track, index) => {
        const features = audioFeatures[index];
        if (!features) return false;

        // Apply energy filter
        if (audioFilters.minEnergy !== undefined && features.energy < audioFilters.minEnergy) return false;
        if (audioFilters.maxEnergy !== undefined && features.energy > audioFilters.maxEnergy) return false;

        // Apply tempo filter
        if (audioFilters.minTempo !== undefined && features.tempo < audioFilters.minTempo) return false;
        if (audioFilters.maxTempo !== undefined && features.tempo > audioFilters.maxTempo) return false;

        // Apply valence filter (happiness/sadness)
        if (audioFilters.minValence !== undefined && features.valence < audioFilters.minValence) return false;
        if (audioFilters.maxValence !== undefined && features.valence > audioFilters.maxValence) return false;

        return true;
      });
    }

    const trackUris = filteredTracks.map(t => t.uri);

    // Add tracks to new playlist in batches (Spotify allows up to 100 tracks per request)
    const batchSize = 100;
    for (let i = 0; i < trackUris.length; i += batchSize) {
      const batch = trackUris.slice(i, i + batchSize);

      await axios.post(
        `https://api.spotify.com/v1/playlists/${newPlaylistId}/tracks`,
        {
          uris: batch
        },
        {
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
          }
        }
      );
    }

    res.json({
      success: true,
      playlistId: newPlaylistId,
      trackCount: trackUris.length,
      totalTracksAnalyzed: trackDetails.length,
      filtersApplied: !!audioFilters
    });
  } catch (error) {
    console.error('Error consolidating playlists:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to consolidate playlists' });
  }
});

// Delete playlists
app.post('/api/delete-playlists', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const { playlistIds } = req.body;

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  if (!playlistIds || !Array.isArray(playlistIds)) {
    return res.status(400).json({ error: 'Invalid playlist IDs' });
  }

  try {
    let deletedCount = 0;

    for (const playlistId of playlistIds) {
      try {
        // Unfollow (delete) playlist
        await axios.delete(
          `https://api.spotify.com/v1/playlists/${playlistId}/followers`,
          {
            headers: {
              'Authorization': 'Bearer ' + token
            }
          }
        );
        deletedCount++;
      } catch (error) {
        console.error(`Failed to delete playlist ${playlistId}:`, error.response?.data || error.message);
        // Continue with other playlists even if one fails
      }
    }

    res.json({
      success: true,
      deletedCount
    });
  } catch (error) {
    console.error('Error deleting playlists:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to delete playlists' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
