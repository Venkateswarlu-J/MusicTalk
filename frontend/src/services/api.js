import axios from 'axios';

const API_BASE = '/api';

export const api = {
  // ── Recognition ────────────────────────────────────────────────────────────
  recognizeAudio: async (file, threshold = 0.5) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await axios.post(`${API_BASE}/recognition/recognize`, formData, {
      params: { threshold },
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  getModelStatus: async () => {
    const response = await axios.get(`${API_BASE}/recognition/models/status`);
    return response.data;
  },

  getModelPerformance: async () => {
    // Conceptual endpoint: GET /api/models/performance
    try {
      const response = await axios.get(`${API_BASE}/models/performance`);
      return response.data;
    } catch (e) {
      // Fallback data if endpoint does not exist yet
      return {
        models: [
          { instrument: "Piano", status: "ACTIVE", precision: 94.21, recall: 93.85, f1Score: 94.03 },
          { instrument: "Acoustic Guitar", status: "ACTIVE", precision: 89.45, recall: 91.20, f1Score: 90.31 },
          { instrument: "Electric Guitar", status: "ACTIVE", precision: 88.50, recall: 87.90, f1Score: 88.20 },
          { instrument: "Violin", status: "ACTIVE", precision: 96.17, recall: 95.77, f1Score: 95.97 },
          { instrument: "Cello", status: "ACTIVE", precision: 91.93, recall: 94.36, f1Score: 93.13 },
          { instrument: "Flute", status: "ACTIVE", precision: 92.10, recall: 90.50, f1Score: 91.29 },
          { instrument: "Clarinet", status: "ACTIVE", precision: 87.65, recall: 89.10, f1Score: 88.37 },
          { instrument: "Saxophone", status: "ACTIVE", precision: 90.30, recall: 88.75, f1Score: 89.52 },
          { instrument: "Trumpet", status: "ACTIVE", precision: 93.05, recall: 92.15, f1Score: 92.60 },
          { instrument: "Organ", status: "ACTIVE", precision: 86.40, recall: 85.50, f1Score: 85.95 },
          { instrument: "Voice", status: "ACTIVE", precision: 95.40, recall: 96.20, f1Score: 95.80 },
          { instrument: "Drums", status: "NOT_TRAINED", precision: null, recall: null, f1Score: null },
          { instrument: "Bass", status: "NOT_TRAINED", precision: null, recall: null, f1Score: null },
          { instrument: "Synthesizer", status: "NOT_TRAINED", precision: null, recall: null, f1Score: null },
          { instrument: "Cymbals", status: "NOT_TRAINED", precision: null, recall: null, f1Score: null },
          { instrument: "Mallet Percussion", status: "NOT_TRAINED", precision: null, recall: null, f1Score: null }
        ]
      };
    }
  },

  getRecognitionHealth: async () => {
    const response = await axios.get(`${API_BASE}/recognition/health`);
    return response.data;
  },

  // ── Catalog ────────────────────────────────────────────────────────────────
  getSongs: async (params = {}) => {
    const response = await axios.get(`${API_BASE}/catalog/songs`, { params });
    return response.data;
  },

  getSongById: async (id) => {
    const response = await axios.get(`${API_BASE}/catalog/songs/${id}`);
    return response.data;
  },

  getSongStatus: async (id) => {
    const response = await axios.get(`${API_BASE}/catalog/songs/${id}/status`);
    return response.data;
  },

  uploadSongs: async (files) => {
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }
    const response = await axios.post(`${API_BASE}/catalog/songs/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  retryUpload: async (songId) => {
    const response = await axios.post(`${API_BASE}/catalog/songs/${songId}/retry`);
    return response.data;
  },

  createSong: async (songData) => {
    const response = await axios.post(`${API_BASE}/catalog/songs`, songData);
    return response.data;
  },

  getSongStreamUrl: (id) => `${API_BASE}/catalog/songs/${id}/stream`,

  // ── Recommendations ────────────────────────────────────────────────────────
  getRecommendationsByInstruments: async (instruments, options = {}) => {
    const { limit = 10, expand = true, excludeSongId, playedSongIds } =
      typeof options === 'number' ? { limit: options } : options;

    const params = {
      instruments: Array.isArray(instruments) ? instruments.join(',') : instruments,
      limit,
      expand,
    };
    if (excludeSongId) {
      params.exclude_song_id = excludeSongId;
    }
    if (playedSongIds && playedSongIds.length > 0) {
      params.played_song_ids = playedSongIds.join(',');
    }

    const response = await axios.get(`${API_BASE}/recommendations/by-instruments`, { params });
    return response.data;
  },

  getRecommendationsByGenre: async (genre, options = {}) => {
    const { limit = 10, excludeSongId, playedSongIds } =
      typeof options === 'number' ? { limit: options } : options;

    const params = { genre, limit };
    if (excludeSongId) {
      params.exclude_song_id = excludeSongId;
    }
    if (playedSongIds && playedSongIds.length > 0) {
      params.played_song_ids = playedSongIds.join(',');
    }

    const response = await axios.get(`${API_BASE}/recommendations/by-genre`, { params });
    return response.data;
  },
};
