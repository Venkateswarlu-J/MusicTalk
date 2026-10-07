import React, { useState, useRef } from 'react';
import {
  Compass,
  Sparkles,
  Loader2,
  Music,
  AlertCircle,
  Play,
  Volume2,
  Sliders,
  Check,
} from 'lucide-react';
import { api } from '../services/api';

const AVAILABLE_INSTRUMENTS = [
  'piano',
  'acoustic_guitar',
  'electric_guitar',
  'violin',
  'cello',
  'flute',
  'clarinet',
  'saxophone',
  'trumpet',
  'organ',
  'voice',
  'drums',
  'bass',
  'synthesizer',
];

export default function Discover() {
  const [selectedInstruments, setSelectedInstruments] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(false);
  const audioRef = useRef(null);
  const [currentPlayingId, setCurrentPlayingId] = useState(null);

  const toggleInstrument = (instr) => {
    if (selectedInstruments.includes(instr)) {
      setSelectedInstruments(selectedInstruments.filter((i) => i !== instr));
    } else {
      setSelectedInstruments([...selectedInstruments, instr]);
    }
  };

  const handleDiscover = async () => {
    if (selectedInstruments.length === 0) return;
    setLoading(true);
    setRecommendations([]);
    try {
      const res = await api.getRecommendationsByInstruments(
        selectedInstruments,
        { limit: 12 }
      );
      const playableRecs = (res.recommendations || []).filter(
        (r) => r.song && (r.song.storage_path || r.song.audio_url)
      );
      setRecommendations(playableRecs);
    } catch (err) {
      console.error('Failed to get recommendations:', err);
    } finally {
      setLoading(false);
    }
  };

  const playSong = (song) => {
    if (!song || !song.id) return;
    if (currentPlayingId === song.id) {
      if (audioRef.current) {
        if (audioRef.current.paused) audioRef.current.play();
        else audioRef.current.pause();
      }
      return;
    }

    setCurrentPlayingId(song.id);
    if (audioRef.current) {
      audioRef.current.src = api.getSongStreamUrl(song.id);
      audioRef.current.load();
      audioRef.current.play().catch((e) => console.log('Play triggered:', e));
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <div className="text-center max-w-3xl mx-auto mt-2">
        <h1 className="text-4xl font-extrabold tracking-tight text-white mb-3 flex items-center justify-center gap-3">
          <Compass className="text-pink-400" size={38} />
          Discover Music by Instrument
        </h1>
        <p className="text-slate-400 text-lg">
          Select target instruments and let our affinity graph discover matching songs
          from your catalog.
        </p>
      </div>

      {/* Instrument Selection Panel */}
      <div className="bg-slate-900/90 border border-slate-700/60 rounded-3xl p-8 shadow-2xl backdrop-blur-md flex flex-col items-center gap-6">
        <div className="flex items-center justify-between w-full border-b border-slate-800 pb-3">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Sliders size={18} className="text-indigo-400" />
            Select Musical Instruments ({selectedInstruments.length} selected)
          </h3>
          {selectedInstruments.length > 0 && (
            <button
              onClick={() => setSelectedInstruments([])}
              className="text-xs text-slate-400 hover:text-white transition"
            >
              Clear All
            </button>
          )}
        </div>

        {/* Chips */}
        <div className="flex flex-wrap gap-2.5 justify-center w-full">
          {AVAILABLE_INSTRUMENTS.map((instr) => {
            const active = selectedInstruments.includes(instr);
            return (
              <button
                key={instr}
                onClick={() => toggleInstrument(instr)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold capitalize transition-all transform hover:scale-105 active:scale-95 ${
                  active
                    ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/25 border-transparent'
                    : 'bg-slate-950 border border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white'
                }`}
              >
                {active && <Check size={14} />}
                <span>{instr.replace(/_/g, ' ')}</span>
              </button>
            );
          })}
        </div>

        {/* Find Recommendations Button */}
        <button
          onClick={handleDiscover}
          disabled={selectedInstruments.length === 0 || loading}
          className={`flex items-center gap-2.5 px-8 py-3.5 rounded-2xl font-bold text-base transition-all transform active:scale-95 ${
            selectedInstruments.length > 0 && !loading
              ? 'bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white shadow-xl shadow-pink-500/25 hover:scale-105'
              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
          }`}
        >
          {loading ? (
            <Loader2 className="animate-spin" size={18} />
          ) : (
            <Sparkles size={18} />
          )}
          <span>{loading ? 'Searching Catalog...' : 'Find Recommendations'}</span>
        </button>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="text-center p-12 space-y-3">
          <Loader2 className="animate-spin text-pink-500 mx-auto" size={38} />
          <p className="text-slate-400 text-sm">
            Computing instrument overlap ratios and affinity graphs across your catalog...
          </p>
        </div>
      )}

      {/* Empty State */}
      {!loading && recommendations.length === 0 && selectedInstruments.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400 flex flex-col items-center gap-3">
          <AlertCircle size={32} className="text-amber-400" />
          <p className="font-semibold text-slate-200">
            No matching tracks found in your catalog for the selected instruments.
          </p>
          <p className="text-xs text-slate-500 max-w-sm">
            Try choosing related instruments or upload more songs into your catalog to
            expand recommendations.
          </p>
        </div>
      )}

      {/* Recommendations Results */}
      {recommendations.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
              <Sparkles size={22} className="text-pink-400" />
              Matching Catalog Tracks ({recommendations.length})
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {recommendations.map(
              ({ song, score, overlap_ratio, avg_confidence, matched_instruments }) => {
                const isPlaying = currentPlayingId === song.id;

                return (
                  <div
                    key={song.id}
                    className={`bg-slate-900/90 border rounded-2xl p-5 flex flex-col justify-between transition-all duration-300 shadow-md ${
                      isPlaying
                        ? 'border-pink-500/80 bg-pink-950/20 shadow-pink-500/10'
                        : 'border-slate-800 hover:border-pink-500/40'
                    }`}
                  >
                    <div>
                      <div className="flex justify-between items-start gap-2 mb-3">
                        <div className="overflow-hidden">
                          <h4
                            className={`font-bold text-base truncate ${
                              isPlaying ? 'text-pink-400' : 'text-white'
                            }`}
                            title={song.title}
                          >
                            {song.title}
                          </h4>
                          <p className="text-xs text-slate-400 truncate">
                            {song.artist || 'Unknown Artist'}
                          </p>
                        </div>
                        <span className="bg-pink-500/15 text-pink-400 px-2.5 py-1 rounded-full text-xs font-bold shrink-0 border border-pink-500/20">
                          {Math.round(score * 100)}% Match
                        </span>
                      </div>

                      <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-850 text-xs space-y-1 text-slate-400 mb-4">
                        <div className="flex justify-between">
                          <span>Overlap:</span>
                          <span className="text-slate-200 font-semibold">
                            {Math.round((overlap_ratio || 0) * 100)}%
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Avg Confidence:</span>
                          <span className="text-slate-200 font-semibold">
                            {Math.round((avg_confidence || 0) * 100)}%
                          </span>
                        </div>
                        {matched_instruments && (
                          <div className="pt-1 mt-1 border-t border-slate-800/80 text-[11px] text-pink-300 truncate">
                            Matched: {matched_instruments.join(', ')}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="pt-2">
                      <button
                        onClick={() => playSong(song)}
                        className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-xs transition-all ${
                          isPlaying
                            ? 'bg-pink-600 text-white shadow-md shadow-pink-500/25'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                        }`}
                      >
                        {isPlaying ? (
                          <Volume2 size={16} className="animate-pulse" />
                        ) : (
                          <Play size={16} />
                        )}
                        <span>{isPlaying ? 'Playing Audio...' : 'Play Track'}</span>
                      </button>
                    </div>
                  </div>
                );
              }
            )}
          </div>
        </div>
      )}

      {/* Hidden audio player */}
      <audio
        ref={audioRef}
        onEnded={() => setCurrentPlayingId(null)}
        className="hidden"
      />
    </div>
  );
}
