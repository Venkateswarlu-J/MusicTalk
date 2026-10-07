import React, { useState, useEffect, useRef } from 'react';
import {
  Upload,
  Search,
  Music2,
  Mic,
  Square,
  Loader2,
  Sparkles,
  AlertCircle,
  Library,
  Info,
  BarChart2,
  Sliders,
  Volume2,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { api } from '../services/api';
import InstrumentCard from '../components/InstrumentCard';
import InstrumentTimeline from '../components/InstrumentTimeline';
import FeedbackWidget from '../components/FeedbackWidget';
import { WavRecorder } from '../utils/wavRecorder';

export default function Recognize() {
  const [activeTab, setActiveTab] = useState('upload'); // 'upload' | 'record' | 'catalog'
  const [file, setFile] = useState(null);

  // Catalog tab state
  const [catalogSongs, setCatalogSongs] = useState([]);
  const [selectedCatalogSong, setSelectedCatalogSong] = useState(null);

  // Microphone recording state (for 'record' tab)
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState(null);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [micVolume, setMicVolume] = useState(0);
  const recorderRef = useRef(null);
  const timerRef = useRef(null);
  const volumeRef = useRef(null);

  // Settings & Analysis State
  const [threshold, setThreshold] = useState(0.5);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [error, setError] = useState(null);

  // Fetch catalog when catalog tab is opened
  useEffect(() => {
    if (activeTab === 'catalog') {
      fetchCatalog();
    }
  }, [activeTab]);

  // Clean up mic recording on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (volumeRef.current) clearInterval(volumeRef.current);
      if (recordedAudioUrl) URL.revokeObjectURL(recordedAudioUrl);
      if (recorderRef.current) recorderRef.current.stop().catch(() => {});
    };
  }, [recordedAudioUrl]);

  const fetchCatalog = async () => {
    try {
      const data = await api.getSongs();
      const playable = (data.songs || []).filter(
        (s) => s.storage_path || s.audio_url
      );
      setCatalogSongs(playable);
    } catch (err) {
      console.error('Failed to load catalog options', err);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  // Process File through AI recognition pipeline
  const processFile = async (audioFile) => {
    setLoading(true);
    setError(null);
    setResult(null);
    setRecommendations([]);

    try {
      const res = await api.recognizeAudio(audioFile, threshold);
      setResult(res);

      // Auto-save analyzed song into MySQL Catalog
      try {
        const instrumentsDict = {};
        if (res.instruments && res.instruments.length > 0) {
          res.instruments.forEach((i) => {
            instrumentsDict[i.instrument] = {
              confidence: i.confidence,
              occurrence: i.occurrence,
              segments: i.segments || [],
            };
          });
        } else if (res.all_scores) {
          res.all_scores.forEach((i) => {
            instrumentsDict[i.instrument] = { confidence: i.confidence };
          });
        }

        const meta = res.metadata || {};
        await api.createSong({
          title: meta.title || audioFile.name?.replace(/\.[^/.]+$/, '') || 'Analyzed Song',
          artist: meta.artist || 'Unknown Artist',
          album: meta.album,
          genre: meta.genre,
          duration_sec: meta.duration_sec,
          instruments: instrumentsDict,
          status: 'DONE',
        });
      } catch (dbErr) {
        console.warn('Analysis completed, catalog record note:', dbErr);
      }

      // Fetch recommendations based on detected instruments
      const detectedNames = (res.instruments || []).map((i) => i.instrument);
      if (detectedNames.length > 0) {
        try {
          const recRes = await api.getRecommendationsByInstruments(
            detectedNames,
            { limit: 6 }
          );
          setRecommendations(recRes.recommendations || []);
        } catch (recErr) {
          console.error('Recommendations error:', recErr);
        }
      }
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          'Failed to process audio. Please ensure backend recognition service is running.'
      );
    } finally {
      setLoading(false);
    }
  };

  // Upload trigger
  const handleUpload = () => {
    if (!file) return;
    processFile(file);
  };

  // Catalog analysis trigger
  const handleAnalyzeCatalog = async () => {
    if (!selectedCatalogSong) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const streamUrl = api.getSongStreamUrl(selectedCatalogSong.id);
      const res = await fetch(streamUrl);
      const blob = await res.blob();
      const catFile = new File(
        [blob],
        selectedCatalogSong.filename || 'catalog_audio.wav',
        { type: blob.type }
      );

      await processFile(catFile);
    } catch (err) {
      setError('Failed to fetch audio from catalog for analysis.');
      setLoading(false);
    }
  };

  // Start Mic Recording
  const startRecording = async () => {
    try {
      setError(null);
      if (recordedAudioUrl) {
        URL.revokeObjectURL(recordedAudioUrl);
        setRecordedAudioUrl(null);
      }
      setRecordedBlob(null);

      const recorder = new WavRecorder();
      await recorder.start();
      recorderRef.current = recorder;

      setIsRecording(true);
      setRecordDuration(0);

      timerRef.current = setInterval(() => {
        setRecordDuration((prev) => prev + 1);
      }, 1000);

      volumeRef.current = setInterval(() => {
        if (recorderRef.current) {
          setMicVolume(recorderRef.current.getVolumeLevel());
        }
      }, 100);
    } catch (err) {
      console.error('Mic recording error:', err);
      setError(
        err.message ||
          'Microphone access denied. Please allow microphone permissions in your browser.'
      );
      setIsRecording(false);
    }
  };

  // Stop Mic Recording
  const stopRecording = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (volumeRef.current) clearInterval(volumeRef.current);
    setIsRecording(false);
    setMicVolume(0);

    if (recorderRef.current) {
      try {
        const blob = await recorderRef.current.stop();
        recorderRef.current = null;
        if (blob && blob.size > 1000) {
          setRecordedBlob(blob);
          setRecordedAudioUrl(URL.createObjectURL(blob));
        } else {
          setError('Recording was too short. Please speak or play for at least 1-2 seconds.');
        }
      } catch (err) {
        console.error('Failed to encode audio:', err);
        setError('Failed to capture audio recording.');
      }
    }
  };

  // Analyze Recorded Audio
  const handleAnalyzeRecorded = () => {
    if (recordedBlob) {
      const audioFile = new File([recordedBlob], 'live_recording.wav', {
        type: 'audio/wav',
      });
      processFile(audioFile);
    }
  };

  const formatSec = (secs) => {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-16">
      {/* Header */}
      <div className="text-center max-w-3xl mx-auto mt-2">
        <h1 className="text-4xl font-extrabold tracking-tight text-white mb-3 flex items-center justify-center gap-3">
          <Sparkles className="text-indigo-400" size={36} />
          AI Instrument Recognition
        </h1>
        <p className="text-slate-400 text-lg">
          Upload an audio file, record live through your microphone, or select a track
          from your catalog to detect instruments and generate temporal timelines.
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex justify-center">
        <div className="bg-slate-900/90 p-1.5 rounded-2xl border border-slate-800 backdrop-blur-md inline-flex shadow-lg">
          <button
            onClick={() => setActiveTab('upload')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'upload'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Upload size={16} /> Upload Audio File
          </button>
          <button
            onClick={() => setActiveTab('record')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'record'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Mic size={16} /> Record Microphone
          </button>
          <button
            onClick={() => setActiveTab('catalog')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'catalog'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Library size={16} /> Choose from Catalog
          </button>
        </div>
      </div>

      {/* Input Box Card */}
      <div className="bg-slate-900/90 border border-slate-700/60 rounded-3xl p-8 md:p-12 shadow-2xl backdrop-blur-md flex flex-col items-center justify-center gap-6 relative">
        {/* ── TAB 1: UPLOAD LOCAL FILE ── */}
        {activeTab === 'upload' && (
          <div className="flex flex-col items-center gap-6 w-full max-w-lg">
            <div className="w-20 h-20 bg-indigo-500/10 border border-indigo-500/20 rounded-3xl flex items-center justify-center shadow-inner">
              <Upload size={38} className="text-indigo-400" />
            </div>

            <div className="w-full text-center">
              <input
                type="file"
                id="audio-upload"
                accept="audio/*"
                onChange={handleFileChange}
                className="hidden"
              />
              <label
                htmlFor="audio-upload"
                className="block w-full py-4 px-6 rounded-2xl border-2 border-dashed border-slate-700 hover:border-indigo-500 bg-slate-950/60 hover:bg-slate-800/40 text-slate-300 font-medium cursor-pointer transition-all shadow-inner"
              >
                {file ? (
                  <span className="font-semibold text-indigo-300 truncate block">
                    📁 {file.name}
                  </span>
                ) : (
                  <div>
                    <span className="font-bold text-white block mb-1">
                      Choose Audio File or Drag & Drop
                    </span>
                    <span className="text-xs text-slate-400">
                      Supports MP3, WAV, FLAC, OGG, M4A
                    </span>
                  </div>
                )}
              </label>
            </div>

            {/* Threshold Slider */}
            <div className="w-full bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                  <Sliders size={14} className="text-indigo-400" />
                  Confidence Threshold
                </span>
                <span className="font-mono text-indigo-400 font-bold">
                  {Math.round(threshold * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0.20"
                max="0.80"
                step="0.05"
                value={threshold}
                onChange={(e) => setThreshold(parseFloat(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer"
              />
            </div>

            <button
              onClick={handleUpload}
              disabled={!file || loading}
              className={`w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-base transition-all transform active:scale-95 ${
                file && !loading
                  ? 'bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white shadow-xl shadow-indigo-500/25 hover:scale-[1.02]'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              {loading ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                <Sparkles size={20} />
              )}
              <span>{loading ? 'Analyzing Audio...' : 'Analyze Audio File'}</span>
            </button>
          </div>
        )}

        {/* ── TAB 2: RECORD MICROPHONE ── */}
        {activeTab === 'record' && (
          <div className="flex flex-col items-center gap-6 w-full max-w-lg">
            <div className="w-20 h-20 bg-rose-500/10 border border-rose-500/20 rounded-3xl flex items-center justify-center shadow-inner">
              <Mic size={38} className={isRecording ? 'text-red-500 animate-pulse' : 'text-rose-400'} />
            </div>

            {/* Recording status */}
            {isRecording ? (
              <div className="flex flex-col items-center gap-3">
                <div className="flex items-center gap-2.5 px-4 py-2 bg-red-500/15 border border-red-500/40 rounded-full text-red-400 font-bold text-base animate-pulse">
                  <span className="w-3 h-3 rounded-full bg-red-500 animate-ping" />
                  <span>Recording: {formatSec(recordDuration)}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Volume2 size={14} />
                  <div className="w-32 h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-rose-500 transition-all duration-100"
                      style={{ width: `${micVolume}%` }}
                    />
                  </div>
                  <span className="font-mono w-8">{micVolume}%</span>
                </div>
              </div>
            ) : (
              <p className="text-slate-400 text-sm text-center">
                Click below to start recording high-fidelity uncompressed 16-bit PCM WAV audio.
              </p>
            )}

            {/* Record / Stop Button */}
            {!isRecording ? (
              <button
                onClick={startRecording}
                className="flex items-center gap-3 px-8 py-3.5 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white font-bold text-base rounded-2xl shadow-xl shadow-red-500/25 transition-all transform hover:scale-105 active:scale-95"
              >
                <Mic size={20} />
                {recordedAudioUrl ? 'Record Again' : 'Start Recording'}
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="flex items-center gap-3 px-8 py-3.5 bg-white hover:bg-slate-100 text-slate-900 font-bold text-base rounded-2xl shadow-xl transition-all transform hover:scale-105 active:scale-95"
              >
                <Square size={18} className="text-red-600 fill-red-600" />
                Stop Recording ({formatSec(recordDuration)})
              </button>
            )}

            {/* Post-Record Player & Analyze Button */}
            {recordedAudioUrl && !isRecording && (
              <div className="w-full bg-slate-950/80 p-5 rounded-2xl border border-slate-800 space-y-4 animate-in slide-in-from-bottom-2 duration-300">
                <div className="flex justify-between items-center text-xs text-slate-400">
                  <span className="font-semibold text-white">Audio Preview</span>
                  <span className="font-mono">WAV 16-bit PCM • {formatSec(recordDuration)}</span>
                </div>
                <audio src={recordedAudioUrl} controls className="w-full h-9 rounded-lg outline-none" />

                {/* Threshold Slider */}
                <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800/80 space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                      <Sliders size={13} className="text-indigo-400" />
                      Confidence Threshold
                    </span>
                    <span className="font-mono text-indigo-400 font-bold">
                      {Math.round(threshold * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.20"
                    max="0.80"
                    step="0.05"
                    value={threshold}
                    onChange={(e) => setThreshold(parseFloat(e.target.value))}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                </div>

                <button
                  onClick={handleAnalyzeRecorded}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-indigo-500 via-indigo-600 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/30 transition-all transform hover:scale-[1.02] active:scale-95 disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="animate-spin" size={18} />
                  ) : (
                    <Sparkles size={18} />
                  )}
                  <span>{loading ? 'Analyzing...' : 'Analyze Recorded Audio'}</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── TAB 3: SELECT FROM CATALOG ── */}
        {activeTab === 'catalog' && (
          <div className="flex flex-col items-center gap-6 w-full max-w-lg">
            <div className="w-20 h-20 bg-indigo-500/10 border border-indigo-500/20 rounded-3xl flex items-center justify-center shadow-inner">
              <Library size={38} className="text-indigo-400" />
            </div>

            <div className="w-full">
              <select
                className="w-full py-3.5 px-4 rounded-2xl border border-slate-700 bg-slate-950 text-slate-100 font-medium cursor-pointer focus:outline-none focus:border-indigo-500 transition shadow-inner"
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedCatalogSong(
                    catalogSongs.find((s) => s.id === parseInt(id, 10)) || null
                  );
                }}
                value={selectedCatalogSong?.id || ''}
              >
                <option value="" disabled>
                  --- Select a Catalog Track ({catalogSongs.length} available) ---
                </option>
                {catalogSongs.map((song) => (
                  <option key={song.id} value={song.id}>
                    {song.title} {song.artist ? `by ${song.artist}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Threshold Slider */}
            <div className="w-full bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                  <Sliders size={14} className="text-indigo-400" />
                  Confidence Threshold
                </span>
                <span className="font-mono text-indigo-400 font-bold">
                  {Math.round(threshold * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0.20"
                max="0.80"
                step="0.05"
                value={threshold}
                onChange={(e) => setThreshold(parseFloat(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer"
              />
            </div>

            <button
              onClick={handleAnalyzeCatalog}
              disabled={!selectedCatalogSong || loading}
              className={`w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-base transition-all transform active:scale-95 ${
                selectedCatalogSong && !loading
                  ? 'bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white shadow-xl shadow-indigo-500/25 hover:scale-[1.02]'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              {loading ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                <Search size={20} />
              )}
              <span>{loading ? 'Analyzing Track...' : 'Analyze Selected Track'}</span>
            </button>
          </div>
        )}

        {/* Error Notification */}
        {error && (
          <div className="flex items-center gap-3 text-red-400 bg-red-500/10 border border-red-500/30 px-5 py-3.5 rounded-2xl max-w-lg text-sm w-full animate-in fade-in">
            <AlertCircle size={20} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* ── ANALYSIS RESULTS SECTION ────────────────────────────────────────── */}
      {loading && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-12 text-center flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-indigo-500" size={44} />
          <h3 className="text-xl font-bold text-white">
            Analyzing Audio Spectrograms...
          </h3>
          <p className="text-slate-400 text-sm max-w-md">
            Sliding 3.0s window feature extraction, 11+ PyTorch binary CNN model inferences,
            and temporal segmentation.
          </p>
        </div>
      )}

      {result && !loading && (
        <div className="space-y-8 animate-in slide-in-from-bottom-6 duration-500 pb-12">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <BarChart2 size={26} className="text-indigo-400" />
              <div>
                <h2 className="text-2xl font-bold text-white tracking-tight">
                  Recognition Intelligence Report
                </h2>
                <p className="text-xs text-slate-400">
                  Evaluated with {result.all_scores?.length || 16} binary instrument classifiers
                </p>
              </div>
            </div>
          </div>

          {/* Metadata Card */}
          {result.metadata && (result.metadata.title || result.metadata.artist) && (
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 flex items-start gap-4 backdrop-blur-md">
              <Info size={24} className="text-indigo-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-white mb-1">Audio Track Metadata</h4>
                <div className="text-slate-300 text-sm space-x-2">
                  <span className="font-semibold text-white">
                    {result.metadata.title || 'Untitled Track'}
                  </span>
                  {result.metadata.artist && (
                    <span className="text-slate-400">by {result.metadata.artist}</span>
                  )}
                  {result.metadata.genre && (
                    <span className="px-2 py-0.5 rounded-full bg-slate-800 text-xs text-slate-300">
                      {result.metadata.genre}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Detected Instruments */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Sparkles size={18} className="text-emerald-400" />
                Detected Instruments (Above {Math.round(threshold * 100)}% Confidence)
              </h3>
              <span className="text-xs text-slate-400 font-mono">
                {result.instruments?.length || 0} Instrument(s) Found
              </span>
            </div>

            {!result.instruments || result.instruments.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400">
                <Music2 size={36} className="mx-auto text-slate-600 mb-2" />
                <p className="font-semibold text-slate-300">
                  No instruments reached the confidence threshold ({Math.round(threshold * 100)}%).
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Try lowering the confidence threshold slider or uploading a higher quality audio track.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {result.instruments.map((item) => (
                  <InstrumentCard
                    key={item.instrument}
                    instrument={item.instrument}
                    confidence={item.confidence}
                    occurrence={item.occurrence}
                    modelAvailable={item.model_available}
                    threshold_used={item.threshold_used || threshold}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Temporal Timeline */}
          {result.timeline && result.timeline.length > 0 && (
            <InstrumentTimeline
              timeline={result.timeline}
              duration={result.metadata?.duration_sec || 30.0}
            />
          )}

          {/* Feedback Widget */}
          {result.instruments && result.instruments.length > 0 && (
            <FeedbackWidget instruments={result.instruments} />
          )}

          {/* Inspired Catalog Recommendations */}
          {recommendations.length > 0 && (
            <div className="pt-6 border-t border-slate-800">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2.5">
                  <Sparkles size={22} className="text-pink-400" />
                  <div>
                    <h3 className="text-xl font-bold text-white">
                      Inspired Catalog Recommendations
                    </h3>
                    <p className="text-xs text-slate-400">
                      Similar songs recommended using instrument affinity graph overlap
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {recommendations.map(
                  ({ song, score, overlap_ratio, avg_confidence, matched_instruments }) => (
                    <div
                      key={song.id}
                      className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 hover:border-pink-500/40 rounded-2xl p-5 flex flex-col justify-between transition-all duration-300 shadow-md group"
                    >
                      <div>
                        <div className="flex justify-between items-start gap-2 mb-3">
                          <div className="overflow-hidden">
                            <h4
                              className="font-bold text-white text-base truncate group-hover:text-pink-300 transition"
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
                            <span>Overlap Ratio:</span>
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
                            <div className="pt-1 mt-1 border-t border-slate-800/80 text-[11px] text-pink-300/90 truncate">
                              Matched: {matched_instruments.join(', ')}
                            </div>
                          )}
                        </div>
                      </div>

                      {song.storage_path && (
                        <audio
                          controls
                          className="w-full h-8 outline-none rounded-md opacity-80 group-hover:opacity-100 transition"
                          src={api.getSongStreamUrl(song.id)}
                        />
                      )}
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {/* All Evaluated Models Breakdown */}
          {result.all_scores && result.all_scores.length > 0 && (
            <div className="pt-6 border-t border-slate-800">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <BarChart2 size={18} className="text-slate-400" />
                  Complete Model Suite ({result.all_scores.length} Classifiers)
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 opacity-85 hover:opacity-100 transition-opacity">
                {result.all_scores.map((item) => (
                  <InstrumentCard
                    key={item.instrument}
                    instrument={item.instrument}
                    confidence={item.confidence}
                    occurrence={item.occurrence}
                    modelAvailable={item.model_available}
                    threshold_used={item.threshold_used || threshold}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
