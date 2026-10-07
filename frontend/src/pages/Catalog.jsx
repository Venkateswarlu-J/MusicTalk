import React, { useState, useEffect, useRef } from 'react';
import {
  Upload,
  Music,
  Play,
  Pause,
  RotateCcw,
  Search,
  Loader2,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Copy,
  Volume2,
  ListMusic,
  Radio,
  Music2,
  Clock,
  Layers,
} from 'lucide-react';
import { api } from '../services/api';

export default function Catalog() {
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [genre, setGenre] = useState('');

  // ── Upload State & Queue ──────────────────────────────────────────────────
  const [uploadQueue, setUploadQueue] = useState([]); // [{ id, filename, status, title, message }]
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const pollingRef = useRef(null);

  // ── Playback & Recommendation State ───────────────────────────────────────
  const [currentSong, setCurrentSong] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playedSongIds, setPlayedSongIds] = useState([]); // Session history
  const [recommendations, setRecommendations] = useState([]);
  const [loadingRecs, setLoadingRecs] = useState(false);
  const [autoPlayEnabled, setAutoPlayEnabled] = useState(true);

  const audioRef = useRef(null);
  const currentSongRef = useRef(null);
  const recommendationsRef = useRef([]);
  const playedSongIdsRef = useRef([]);

  // Keep refs in sync with state
  useEffect(() => {
    currentSongRef.current = currentSong;
  }, [currentSong]);

  useEffect(() => {
    recommendationsRef.current = recommendations;
  }, [recommendations]);

  useEffect(() => {
    playedSongIdsRef.current = playedSongIds;
  }, [playedSongIds]);

  // ── Fetch Catalog Songs (Only playable songs) ─────────────────────────────
  const fetchSongs = async () => {
    setLoading(true);
    try {
      const data = await api.getSongs({ search, genre });
      const playableSongs = (data.songs || []).filter(
        (s) => s.storage_path || s.audio_url
      );
      setSongs(playableSongs);
    } catch (err) {
      console.error('Failed to fetch catalog songs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSongs();
  }, [genre]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchSongs();
  };

  // ── Upload Handling & Polling ─────────────────────────────────────────────
  const handleFilesSelected = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingFiles(true);
    try {
      const res = await api.uploadSongs(files);
      const newItems = res.results || [];

      setUploadQueue((prev) => {
        const combined = [...newItems, ...prev];
        const unique = [];
        const seen = new Set();
        for (const item of combined) {
          const key = `${item.id || ''}_${item.filename}`;
          if (!seen.has(key)) {
            seen.add(key);
            unique.push(item);
          }
        }
        return unique;
      });

      fetchSongs();
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploadingFiles(false);
      e.target.value = '';
    }
  };

  // Poll for pending upload statuses (UPLOADED / PROCESSING)
  useEffect(() => {
    const pendingItems = uploadQueue.filter(
      (item) => item.id && (item.status === 'UPLOADED' || item.status === 'PROCESSING')
    );

    if (pendingItems.length === 0) {
      if (pollingRef.current) clearInterval(pollingRef.current);
      return;
    }

    pollingRef.current = setInterval(async () => {
      let changed = false;
      const updated = await Promise.all(
        uploadQueue.map(async (item) => {
          if (item.id && (item.status === 'UPLOADED' || item.status === 'PROCESSING')) {
            try {
              const statusRes = await api.getSongStatus(item.id);
              if (statusRes.status !== item.status) {
                changed = true;
                return {
                  ...item,
                  status: statusRes.status,
                  title: statusRes.title || item.title,
                  artist: statusRes.artist || item.artist,
                  instruments: statusRes.instruments,
                };
              }
            } catch (err) {
              console.error(`Error polling status for song ${item.id}:`, err);
            }
          }
          return item;
        })
      );

      if (changed) {
        setUploadQueue(updated);
        fetchSongs();
      }
    }, 1500);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [uploadQueue]);

  const handleRetry = async (songId) => {
    try {
      await api.retryUpload(songId);
      setUploadQueue((prev) =>
        prev.map((item) =>
          item.id === songId ? { ...item, status: 'UPLOADED', message: 'Retrying...' } : item
        )
      );
    } catch (err) {
      console.error('Retry failed:', err);
    }
  };

  // ── Song Playback & Recommendations ───────────────────────────────────────
  const playSong = async (song) => {
    if (!song) return;

    setCurrentSong(song);
    currentSongRef.current = song;
    setIsPlaying(true);

    const history = playedSongIdsRef.current.includes(song.id)
      ? playedSongIdsRef.current
      : [...playedSongIdsRef.current, song.id];
    playedSongIdsRef.current = history;
    setPlayedSongIds(history);

    if (audioRef.current) {
      audioRef.current.src = api.getSongStreamUrl(song.id);
      audioRef.current.load();
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch((e) => console.log('Audio play triggered:', e));
    }

    const instrumentNames = song.instruments ? Object.keys(song.instruments) : [];
    if (instrumentNames.length > 0) {
      setLoadingRecs(true);
      try {
        const recRes = await api.getRecommendationsByInstruments(instrumentNames, {
          limit: 8,
          excludeSongId: song.id,
          playedSongIds: history,
        });
        const recList = recRes.recommendations || [];
        setRecommendations(recList);
        recommendationsRef.current = recList;
      } catch (err) {
        console.error('Error fetching recommendations:', err);
        setRecommendations([]);
        recommendationsRef.current = [];
      } finally {
        setLoadingRecs(false);
      }
    } else {
      setRecommendations([]);
      recommendationsRef.current = [];
    }
  };

  const handleSongEnded = () => {
    if (!autoPlayEnabled) {
      setIsPlaying(false);
      return;
    }

    const nextQueue = recommendationsRef.current;
    if (nextQueue && nextQueue.length > 0) {
      const topMatch = nextQueue[0].song;
      console.log('Continuous auto-play next track:', topMatch.title);
      playSong(topMatch);
    } else {
      setIsPlaying(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-36">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-white mb-2 flex items-center gap-3">
            <Music className="text-indigo-400" size={36} />
            Music Catalog & Player
          </h1>
          <p className="text-slate-400 text-lg">
            Manage your persistent audio library with automated neural network tagging and smart auto-play.
          </p>
        </div>
      </div>

      {/* ── Multi-File Upload Dropzone ──────────────────────────────────────── */}
      <div className="bg-slate-900/90 border-2 border-dashed border-slate-700/80 hover:border-indigo-500/80 rounded-3xl p-8 md:p-10 flex flex-col items-center gap-5 text-center transition-all backdrop-blur shadow-lg group">
        <div className="w-16 h-16 bg-indigo-500/10 rounded-2xl flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
          <Upload size={32} />
        </div>
        <div>
          <h3 className="text-xl font-bold text-white mb-1">
            Upload Audio Tracks to Your Catalog
          </h3>
          <p className="text-sm text-slate-400 max-w-md">
            Upload MP3, WAV, FLAC, or OGG tracks. Automatic AI instrument recognition
            extracts spectrograms and tags in the background.
          </p>
        </div>

        <label className="flex items-center gap-2.5 px-6 py-3.5 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold rounded-2xl cursor-pointer shadow-xl shadow-indigo-500/25 transition-all transform hover:scale-105 active:scale-95">
          {uploadingFiles ? (
            <Loader2 className="animate-spin" size={20} />
          ) : (
            <Upload size={20} />
          )}
          <span>{uploadingFiles ? 'Uploading Audio...' : 'Choose Audio Files'}</span>
          <input
            type="file"
            accept="audio/*"
            multiple
            onChange={handleFilesSelected}
            disabled={uploadingFiles}
            className="hidden"
          />
        </label>
      </div>

      {/* ── Upload Status Queue ──────────────────────────────────────────────── */}
      {uploadQueue.length > 0 && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-md">
          <h3 className="text-base font-bold text-white mb-3 flex items-center gap-2">
            <ListMusic size={18} className="text-indigo-400" />
            Upload Processing Queue ({uploadQueue.length})
          </h3>
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {uploadQueue.map((item, idx) => {
              const isUploading =
                item.status === 'UPLOADED' || item.status === 'PROCESSING';
              const isDone = item.status === 'DONE';
              const isDuplicate = item.status === 'SKIPPED_DUPLICATE';
              const isFailed = item.status === 'FAILED';

              return (
                <div
                  key={`${item.id || idx}_${item.filename}`}
                  className="flex items-center justify-between p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl text-sm"
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <Music size={16} className="text-slate-500 shrink-0" />
                    <div className="truncate">
                      <div className="font-semibold text-slate-200 truncate">
                        {item.title || item.filename}
                      </div>
                      <div className="text-xs text-slate-500 truncate">{item.filename}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    {isUploading && (
                      <span className="flex items-center gap-1.5 text-indigo-400 text-xs font-semibold bg-indigo-500/10 px-2.5 py-1 rounded-full border border-indigo-500/20">
                        <Loader2 className="animate-spin" size={13} />
                        Processing…
                      </span>
                    )}

                    {isDone && (
                      <span className="flex items-center gap-1.5 text-emerald-400 text-xs font-semibold bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                        <CheckCircle2 size={13} />
                        Uploaded & Tagged
                      </span>
                    )}

                    {isDuplicate && (
                      <span className="flex items-center gap-1.5 text-amber-400 text-xs font-semibold bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20">
                        <Copy size={13} />
                        Duplicate
                      </span>
                    )}

                    {isFailed && (
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1.5 text-rose-400 text-xs font-semibold bg-rose-500/10 px-2.5 py-1 rounded-full border border-rose-500/20">
                          <AlertCircle size={13} />
                          Failed
                        </span>
                        {item.id && (
                          <button
                            onClick={() => handleRetry(item.id)}
                            className="flex items-center gap-1 bg-rose-500/20 text-rose-300 border border-rose-500/40 px-2 py-1 rounded-lg text-xs font-semibold hover:bg-rose-500/30 transition"
                          >
                            <RotateCcw size={12} /> Retry
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Search & Filter Toolbar ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <form onSubmit={handleSearchSubmit} className="flex-1 flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Search by title, artist, or album..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-2xl py-3 pl-4 pr-10 text-sm text-white focus:outline-none focus:border-indigo-500 shadow-inner"
            />
          </div>
          <button
            type="submit"
            className="px-5 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl transition flex items-center justify-center shadow-md"
          >
            <Search size={18} />
          </button>
        </form>

        <select
          value={genre}
          onChange={(e) => setGenre(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 shadow-inner cursor-pointer"
        >
          <option value="">All Genres</option>
          <option value="classical">Classical</option>
          <option value="jazz">Jazz</option>
          <option value="rock">Rock</option>
          <option value="pop">Pop</option>
          <option value="folk">Folk</option>
          <option value="blues">Blues</option>
        </select>
      </div>

      {/* ── Catalog Tracks Grid ─────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex justify-center p-16">
          <Loader2 className="animate-spin text-indigo-500" size={40} />
        </div>
      ) : songs.length === 0 ? (
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-12 text-center text-slate-400">
          <Music2 size={48} className="mx-auto text-slate-600 mb-3" />
          <h3 className="text-xl font-bold text-white mb-1">No Tracks in Catalog</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            Upload your audio files above to populate your music library with automated
            neural network recognition and continuous playback.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white tracking-tight">
              Playable Library ({songs.length} Tracks)
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {songs.map((song) => {
              const isCurrentlyPlaying = currentSong?.id === song.id && isPlaying;
              const isSelected = currentSong?.id === song.id;
              const instruments = song.instruments ? Object.entries(song.instruments) : [];

              return (
                <div
                  key={song.id}
                  className={`bg-slate-900/90 border rounded-2xl p-5 flex flex-col justify-between transition-all duration-300 shadow-md ${
                    isSelected
                      ? 'border-indigo-500/80 bg-indigo-950/20 shadow-indigo-500/10'
                      : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div>
                    {/* Card Header */}
                    <div className="flex justify-between items-start gap-3 mb-3">
                      <div className="overflow-hidden">
                        <h3
                          className={`font-bold text-base truncate ${
                            isSelected ? 'text-indigo-400' : 'text-white'
                          }`}
                          title={song.title}
                        >
                          {song.title}
                        </h3>
                        <p className="text-xs text-slate-400 truncate">
                          {song.artist || 'Unknown Artist'}
                        </p>
                        {song.album && (
                          <p className="text-[11px] text-slate-500 truncate">
                            Album: {song.album}
                          </p>
                        )}
                      </div>

                      <button
                        onClick={() => playSong(song)}
                        className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-transform active:scale-95 shadow-md ${
                          isCurrentlyPlaying
                            ? 'bg-indigo-600 text-white animate-pulse'
                            : 'bg-slate-800 text-slate-200 hover:bg-indigo-600 hover:text-white'
                        }`}
                        title="Play Track"
                      >
                        {isCurrentlyPlaying ? (
                          <Volume2 size={20} />
                        ) : (
                          <Play size={18} className="ml-0.5" />
                        )}
                      </button>
                    </div>

                    {/* Metadata Badges */}
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {song.genre && (
                        <span className="bg-pink-500/15 text-pink-400 px-2 py-0.5 rounded-full text-xs font-semibold border border-pink-500/20">
                          {song.genre}
                        </span>
                      )}
                      {song.duration_sec && (
                        <span className="bg-slate-800 text-slate-400 px-2 py-0.5 rounded-md text-xs font-mono flex items-center gap-1">
                          <Clock size={11} />
                          {Math.floor(song.duration_sec / 60)}:
                          {(Math.floor(song.duration_sec) % 60)
                            .toString()
                            .padStart(2, '0')}
                        </span>
                      )}
                    </div>

                    {/* Detected Instruments breakdown */}
                    {instruments.length > 0 && (
                      <div className="pt-3 border-t border-slate-800/80 space-y-2">
                        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                          Recognized Instruments
                        </div>
                        <div className="space-y-1.5">
                          {instruments.slice(0, 3).map(([inst, conf]) => {
                            const confVal =
                              typeof conf === 'object'
                                ? conf.confidence !== undefined
                                  ? conf.confidence
                                  : 0
                                : conf;
                            const pct = Math.round(Number(confVal) * 100);
                            return (
                              <div key={inst} className="text-xs">
                                <div className="flex justify-between text-slate-300 mb-0.5">
                                  <span className="capitalize">{inst.replace(/_/g, ' ')}</span>
                                  <span className="font-mono font-bold text-slate-400">
                                    {pct}%
                                  </span>
                                </div>
                                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${
                                      pct >= 70
                                        ? 'bg-emerald-500'
                                        : pct >= 45
                                        ? 'bg-indigo-500'
                                        : 'bg-amber-500'
                                    }`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Fixed Bottom Audio Playback & Smart Recommendation Dock ───────── */}
      {currentSong && (
        <div className="fixed bottom-0 left-0 right-0 bg-slate-950/95 border-t border-slate-800 p-4 md:px-8 z-50 backdrop-blur-xl shadow-2xl animate-in slide-in-from-bottom-4 duration-300">
          <div className="max-w-7xl mx-auto flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-4">
              {/* Now Playing Info */}
              <div className="flex items-center gap-3 min-w-[200px]">
                <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shrink-0 shadow-lg shadow-indigo-500/20">
                  <Music size={24} />
                </div>
                <div className="overflow-hidden">
                  <div className="font-bold text-white text-base truncate">
                    {currentSong.title}
                  </div>
                  <div className="text-xs text-slate-400 truncate">
                    {currentSong.artist || 'Unknown Artist'}
                  </div>
                </div>
              </div>

              {/* Native Audio Player */}
              <div className="flex-1 max-w-xl">
                <audio
                  ref={audioRef}
                  src={api.getSongStreamUrl(currentSong.id)}
                  autoPlay
                  controls
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onEnded={handleSongEnded}
                  className="w-full h-9 rounded-lg outline-none"
                />
              </div>

              {/* Continuous Auto-Play Toggle */}
              <button
                onClick={() => setAutoPlayEnabled(!autoPlayEnabled)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold border transition ${
                  autoPlayEnabled
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 shadow-sm shadow-emerald-500/20'
                    : 'bg-slate-900 text-slate-400 border-slate-700'
                }`}
                title="Continuous auto-play next best matching song"
              >
                <Radio size={14} className={autoPlayEnabled ? 'animate-pulse' : ''} />
                <span>Continuous Auto-Play: {autoPlayEnabled ? 'ON' : 'OFF'}</span>
              </button>
            </div>

            {/* Smart Recommendations Bar */}
            <div className="border-t border-slate-800/80 pt-2 flex items-center gap-3 overflow-x-auto">
              <span className="text-xs font-bold text-pink-400 flex items-center gap-1.5 shrink-0">
                <Sparkles size={14} /> Up Next:
              </span>

              {loadingRecs ? (
                <span className="text-xs text-slate-400 flex items-center gap-2">
                  <Loader2 className="animate-spin" size={13} />
                  Finding matching recommendations...
                </span>
              ) : recommendations.length > 0 ? (
                <div className="flex gap-2.5 overflow-x-auto pb-1">
                  {recommendations.map(
                    ({ song, score, matched_instruments }, idx) => (
                      <button
                        key={song.id}
                        onClick={() => playSong(song)}
                        className="bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-pink-500/50 px-3 py-1.5 rounded-xl text-xs flex items-center gap-2 text-slate-200 transition shrink-0"
                      >
                        <span className="text-pink-400 font-bold">#{idx + 1}</span>
                        <span className="font-semibold truncate max-w-[140px]">
                          {song.title}
                        </span>
                        <span className="bg-pink-500/20 text-pink-300 px-1.5 py-0.5 rounded text-[10px] font-mono">
                          {Math.round(score * 100)}%
                        </span>
                      </button>
                    )
                  )}
                </div>
              ) : (
                <span className="text-xs text-slate-500">
                  No further catalog matches found. Upload more songs to enrich queue!
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
