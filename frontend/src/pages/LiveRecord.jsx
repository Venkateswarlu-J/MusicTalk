import React, { useState, useRef, useEffect } from 'react';
import {
  Mic,
  Square,
  Loader2,
  Sparkles,
  Volume2,
  AlertCircle,
  Play,
  Pause,
  RotateCcw,
  Download,
  Save,
  Radio,
  Sliders,
  CheckCircle2,
  Music,
  Activity,
  Layers,
  BarChart2,
  Info,
} from 'lucide-react';
import { api } from '../services/api';
import InstrumentCard from '../components/InstrumentCard';
import InstrumentTimeline from '../components/InstrumentTimeline';
import FeedbackWidget from '../components/FeedbackWidget';
import { WavRecorder } from '../utils/wavRecorder';

export default function LiveRecord() {
  // Mode: 'studio' (Record & Analyze) | 'stream' (Continuous Live Stream)
  const [mode, setMode] = useState('studio');

  // Recording State
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [visualizerType, setVisualizerType] = useState('bars'); // 'bars' | 'wave'

  // Settings
  const [autoAnalyze, setAutoAnalyze] = useState(false);
  const [threshold, setThreshold] = useState(0.5);

  // Analysis & Loading State
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [error, setError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(null);

  // Save to Catalog Modal/Form
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveTitle, setSaveTitle] = useState('Live Recording');
  const [saveArtist, setSaveArtist] = useState('Microphone Session');
  const [saveGenre, setSaveGenre] = useState('');
  const [savingToDb, setSavingToDb] = useState(false);

  // Refs
  const recorderRef = useRef(null);
  const timerRef = useRef(null);
  const chunkTimerRef = useRef(null);
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const volumeIntervalRef = useRef(null);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (chunkTimerRef.current) clearInterval(chunkTimerRef.current);
      if (volumeIntervalRef.current) clearInterval(volumeIntervalRef.current);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (recorderRef.current) recorderRef.current.stop().catch(() => {});
    };
  }, [audioUrl]);

  // Audio Canvas Visualizer
  const drawVisualizer = () => {
    if (!recorderRef.current || !canvasRef.current || !recording) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const WIDTH = canvas.width;
    const HEIGHT = canvas.height;

    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    if (visualizerType === 'bars') {
      const dataArray = recorderRef.current.getAnalyserData();
      if (!dataArray || dataArray.length === 0) {
        animationRef.current = requestAnimationFrame(drawVisualizer);
        return;
      }

      const barWidth = (WIDTH / dataArray.length) * 2.2;
      let x = 0;

      for (let i = 0; i < dataArray.length; i++) {
        const barHeight = (dataArray[i] / 255) * HEIGHT;

        // Gradient color from indigo to pink/emerald
        const gradient = ctx.createLinearGradient(0, HEIGHT, 0, 0);
        gradient.addColorStop(0, '#6366f1');
        gradient.addColorStop(0.5, '#a855f7');
        gradient.addColorStop(1, '#ec4899');

        ctx.fillStyle = gradient;
        ctx.fillRect(x, HEIGHT - barHeight, barWidth - 1, barHeight);

        x += barWidth;
      }
    } else {
      // Oscilloscope Waveform
      const timeData = recorderRef.current.getTimeDomainData();
      if (!timeData || timeData.length === 0) {
        animationRef.current = requestAnimationFrame(drawVisualizer);
        return;
      }

      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#38bdf8';
      ctx.beginPath();

      const sliceWidth = WIDTH / timeData.length;
      let x = 0;

      for (let i = 0; i < timeData.length; i++) {
        const v = timeData[i] / 128.0;
        const y = (v * HEIGHT) / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        x += sliceWidth;
      }

      ctx.lineTo(WIDTH, HEIGHT / 2);
      ctx.stroke();
    }

    animationRef.current = requestAnimationFrame(drawVisualizer);
  };

  useEffect(() => {
    if (recording) {
      drawVisualizer();
    }
  }, [recording, visualizerType]);

  // Start Recording
  const startRecording = async () => {
    try {
      setError(null);
      setSaveSuccess(null);
      if (!recording) {
        setResult(null);
        setRecommendations([]);
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
        setAudioUrl(null);
      }
      setRecordedBlob(null);

      const recorder = new WavRecorder();
      await recorder.start();
      recorderRef.current = recorder;

      setRecording(true);
      setRecordingSeconds(0);

      // Duration Timer
      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);

      // Volume Level Meter
      volumeIntervalRef.current = setInterval(() => {
        if (recorderRef.current) {
          setVolumeLevel(recorderRef.current.getVolumeLevel());
        }
      }, 100);

      // Live streaming chunk timer (only in streaming mode)
      if (mode === 'stream') {
        chunkTimerRef.current = setInterval(async () => {
          if (!recorderRef.current) return;
          const chunkBlob = recorderRef.current.getLatestChunk(5);
          if (chunkBlob) {
            analyzeAudioBlob(chunkBlob, false);
          }
        }, 4000);
      }
    } catch (err) {
      console.error('Microphone error:', err);
      setError(
        err.message ||
          'Failed to access microphone. Please check browser microphone permissions.'
      );
      setRecording(false);
    }
  };

  // Stop Recording
  const stopRecording = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (chunkTimerRef.current) clearInterval(chunkTimerRef.current);
    if (volumeIntervalRef.current) clearInterval(volumeIntervalRef.current);
    if (animationRef.current) cancelAnimationFrame(animationRef.current);

    setRecording(false);
    setVolumeLevel(0);

    if (recorderRef.current) {
      try {
        const wavBlob = await recorderRef.current.stop();
        recorderRef.current = null;

        if (wavBlob && wavBlob.size > 1000) {
          const url = URL.createObjectURL(wavBlob);
          setAudioUrl(url);
          setRecordedBlob(wavBlob);

          // If Auto-Analyze is turned ON or if we were in stream mode, trigger analysis immediately
          if (autoAnalyze || mode === 'stream') {
            await analyzeAudioBlob(wavBlob, true);
          }
        } else {
          setError('Recording was too short. Please record for at least 1-2 seconds.');
        }
      } catch (err) {
        console.error('Error stopping recording:', err);
        setError(err.message || 'Failed to process recorded audio.');
      }
    }
  };

  // Run AI Analysis on recorded blob
  const analyzeAudioBlob = async (blobToAnalyze, isFullAnalysis = true) => {
    if (!blobToAnalyze) return;

    if (isFullAnalysis) {
      setAnalyzing(true);
      setError(null);
      setSaveSuccess(null);
    }

    try {
      const audioFile = new File([blobToAnalyze], 'recording.wav', {
        type: 'audio/wav',
      });
      const res = await api.recognizeAudio(audioFile, threshold);
      setResult(res);

      // If full analysis, also fetch recommendations based on detected instruments
      if (isFullAnalysis) {
        const detectedNames = (res.instruments || []).map((i) => i.instrument);
        if (detectedNames.length > 0) {
          try {
            const recRes = await api.getRecommendationsByInstruments(
              detectedNames,
              { limit: 6 }
            );
            setRecommendations(recRes.recommendations || []);
          } catch (recErr) {
            console.warn('Recommendations fetch warning:', recErr);
          }
        }
      }
    } catch (err) {
      console.error('Recognition error:', err);
      if (isFullAnalysis) {
        setError(
          err.response?.data?.detail ||
            'Failed to analyze audio. Please ensure backend services are running.'
        );
      }
    } finally {
      if (isFullAnalysis) {
        setAnalyzing(false);
      }
    }
  };

  // Manual Trigger for Analyze Button
  const handleManualAnalyze = () => {
    if (recordedBlob) {
      analyzeAudioBlob(recordedBlob, true);
    }
  };

  // Download recorded WAV file
  const handleDownload = () => {
    if (!audioUrl) return;
    const a = document.createElement('a');
    a.href = audioUrl;
    a.download = `musictalk_recording_${Date.now()}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Save recording to MySQL Catalog
  const handleSaveToCatalog = async () => {
    if (!recordedBlob) return;
    setSavingToDb(true);
    setError(null);

    try {
      const instrumentsDict = {};
      if (result?.instruments && result.instruments.length > 0) {
        result.instruments.forEach((i) => {
          instrumentsDict[i.instrument] = {
            confidence: i.confidence,
            occurrence: i.occurrence,
            segments: i.segments || [],
          };
        });
      } else if (result?.all_scores) {
        result.all_scores.forEach((i) => {
          instrumentsDict[i.instrument] = { confidence: i.confidence };
        });
      }

      await api.createSong({
        title: saveTitle || 'Live Microphone Recording',
        artist: saveArtist || 'Live Session',
        genre: saveGenre || 'Live Recording',
        duration_sec: recordingSeconds || 5.0,
        instruments: instrumentsDict,
        status: 'DONE',
      });

      setSaveSuccess('Recording profile successfully saved to Music Catalog!');
      setShowSaveModal(false);
    } catch (err) {
      console.error('Save to catalog failed:', err);
      setError(
        err.response?.data?.detail ||
          'Failed to save recording to catalog database.'
      );
    } finally {
      setSavingToDb(false);
    }
  };

  const formatTime = (secs) => {
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
          <Mic className="text-indigo-400" size={38} />
          Live Music Recording & Detection
        </h1>
        <p className="text-slate-400 text-lg">
          Capture musical instruments directly via your microphone with real-time
          wave analysis and deep neural network inference.
        </p>
      </div>

      {/* Mode & Visualizer Toggles */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900/80 p-3 rounded-2xl border border-slate-800 backdrop-blur">
        {/* Mode Selector */}
        <div className="flex items-center gap-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setMode('studio')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              mode === 'studio'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Mic size={16} /> Studio Record & Analyze
          </button>
          <button
            onClick={() => setMode('stream')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              mode === 'stream'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Radio size={16} className={mode === 'stream' ? 'animate-pulse' : ''} />
            Live Rolling Detection
          </button>
        </div>

        {/* Visualizer Type & Settings */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setVisualizerType('bars')}
              className={`px-3 py-1.5 rounded-md font-medium transition ${
                visualizerType === 'bars'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Frequency Bars
            </button>
            <button
              onClick={() => setVisualizerType('wave')}
              className={`px-3 py-1.5 rounded-md font-medium transition ${
                visualizerType === 'wave'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Oscilloscope
            </button>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-400 bg-slate-950/60 px-3 py-2 rounded-xl border border-slate-800 cursor-pointer hover:text-slate-200">
            <input
              type="checkbox"
              checked={autoAnalyze}
              onChange={(e) => setAutoAnalyze(e.target.checked)}
              className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0"
            />
            <span>Auto-analyze on stop</span>
          </label>
        </div>
      </div>

      {/* Main Studio Recording Console */}
      <div className="bg-slate-900/90 border border-slate-700/60 rounded-3xl p-8 md:p-12 shadow-2xl backdrop-blur-md flex flex-col items-center gap-8 relative overflow-hidden">
        {/* Glow ambient background effect */}
        {recording && (
          <div className="absolute -top-32 -left-32 w-80 h-80 bg-red-500/10 rounded-full blur-3xl pointer-events-none animate-pulse" />
        )}

        {/* Recording Status & Timer */}
        {recording ? (
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-3 px-5 py-2.5 bg-red-500/15 border border-red-500/40 rounded-full text-red-400 font-bold text-lg shadow-lg shadow-red-500/10 animate-pulse">
              <span className="w-3.5 h-3.5 rounded-full bg-red-500 animate-ping" />
              <span>RECORDING: {formatTime(recordingSeconds)}</span>
            </div>

            {/* Volume Level Meter */}
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Volume2 size={15} />
              <div className="w-32 h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 via-yellow-400 to-red-500 transition-all duration-100"
                  style={{ width: `${volumeLevel}%` }}
                />
              </div>
              <span className="font-mono w-8">{volumeLevel}%</span>
            </div>
          </div>
        ) : (
          <div className="text-center">
            <span className="px-4 py-1.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
              {audioUrl ? 'Recording Ready for Analysis' : 'Studio Microphone Ready'}
            </span>
          </div>
        )}

        {/* Real-time Canvas Waveform Visualizer */}
        <div className="w-full max-w-2xl bg-slate-950/80 rounded-2xl p-4 border border-slate-800/80 shadow-inner">
          <canvas
            ref={canvasRef}
            width={600}
            height={120}
            className="w-full h-28 rounded-xl bg-slate-950"
          />
        </div>

        {/* Action Controls: Start / Stop / Re-record Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-4">
          {!recording ? (
            <button
              onClick={startRecording}
              className="flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white font-bold text-lg rounded-full shadow-xl shadow-red-500/25 transition-all transform hover:scale-105 active:scale-95"
            >
              <Mic size={24} />
              {audioUrl ? 'Record New Audio' : 'Start Recording'}
            </button>
          ) : (
            <button
              onClick={stopRecording}
              className="flex items-center gap-3 px-8 py-4 bg-white hover:bg-slate-100 text-slate-900 font-bold text-lg rounded-full shadow-2xl transition-all transform hover:scale-105 active:scale-95"
            >
              <Square size={22} className="text-red-600 fill-red-600" />
              Stop Recording ({formatTime(recordingSeconds)})
            </button>
          )}
        </div>

        {/* ── Post-Recording Player & Prominent Action Bar ───────────────────── */}
        {audioUrl && !recording && (
          <div className="w-full max-w-2xl bg-slate-950/90 border border-slate-800 rounded-2xl p-6 flex flex-col gap-5 animate-in slide-in-from-bottom-3 duration-300">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                <Volume2 size={18} className="text-indigo-400" />
                <span>Recorded Audio Preview</span>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                Duration: {formatTime(recordingSeconds)} • WAV 16-bit PCM
              </span>
            </div>

            {/* Native Audio Controls */}
            <audio src={audioUrl} controls className="w-full h-10 outline-none rounded-lg" />

            {/* Threshold Slider */}
            <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800/80 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                  <Sliders size={14} className="text-indigo-400" />
                  Detection Confidence Threshold
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
              <div className="flex justify-between text-[11px] text-slate-500">
                <span>Sensitive (20%)</span>
                <span>Balanced (50%)</span>
                <span>Strict (80%)</span>
              </div>
            </div>

            {/* Prominent Action Buttons: Analyze / Download / Save */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <button
                onClick={handleManualAnalyze}
                disabled={analyzing}
                className="sm:col-span-1 flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-indigo-500 via-indigo-600 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/30 transition-all transform hover:scale-[1.02] disabled:opacity-50"
              >
                {analyzing ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <Sparkles size={18} />
                )}
                <span>{analyzing ? 'Analyzing...' : 'Analyze Audio'}</span>
              </button>

              <button
                onClick={() => setShowSaveModal(true)}
                className="flex items-center justify-center gap-2 py-3 px-4 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-semibold rounded-xl transition"
              >
                <Save size={18} className="text-emerald-400" />
                <span>Save to Catalog</span>
              </button>

              <button
                onClick={handleDownload}
                className="flex items-center justify-center gap-2 py-3 px-4 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-semibold rounded-xl transition"
              >
                <Download size={18} className="text-sky-400" />
                <span>Download WAV</span>
              </button>
            </div>
          </div>
        )}

        {/* Error Notification */}
        {error && (
          <div className="flex items-center gap-3 text-red-400 bg-red-500/10 border border-red-500/30 px-5 py-3.5 rounded-xl max-w-xl text-sm w-full animate-in fade-in">
            <AlertCircle size={20} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Success Notification */}
        {saveSuccess && (
          <div className="flex items-center gap-3 text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-5 py-3.5 rounded-xl max-w-xl text-sm w-full animate-in fade-in">
            <CheckCircle2 size={20} className="shrink-0" />
            <span>{saveSuccess}</span>
          </div>
        )}
      </div>

      {/* ── Analysis Results Section ────────────────────────────────────────── */}
      {analyzing && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-12 text-center flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-indigo-500" size={44} />
          <h3 className="text-xl font-bold text-white">
            Evaluating Neural Network Models...
          </h3>
          <p className="text-slate-400 text-sm max-w-md">
            Extracting 128-mel spectrograms, running binary CNN detectors, and
            calculating temporal occurrences.
          </p>
        </div>
      )}

      {result && !analyzing && (
        <div className="space-y-8 animate-in slide-in-from-bottom-6 duration-500 pb-12">
          {/* Result Header */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <BarChart2 size={26} className="text-indigo-400" />
              <div>
                <h2 className="text-2xl font-bold text-white tracking-tight">
                  Recognition Intelligence Report
                </h2>
                <p className="text-xs text-slate-400">
                  Evaluated with {result.all_scores?.length || 16} binary instrument
                  classifiers
                </p>
              </div>
            </div>

            {mode === 'stream' && recording && (
              <span className="flex items-center gap-2 text-xs font-semibold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 px-3 py-1.5 rounded-full">
                <Radio size={14} className="animate-pulse" />
                Live Rolling Refresh
              </span>
            )}
          </div>

          {/* High-Confidence Detected Instruments */}
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
                <Music size={36} className="mx-auto text-slate-600 mb-2" />
                <p className="font-semibold text-slate-300">
                  No instruments reached the confidence threshold ({Math.round(threshold * 100)}%).
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Try lowering the threshold slider above or re-recording closer to the instrument.
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
              duration={recordingSeconds || result.metadata?.duration_sec || 5.0}
            />
          )}

          {/* Continuous Learning Active Feedback */}
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
                      Matching tracks from your catalog using affinity graph scoring
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
                  <Layers size={18} className="text-slate-400" />
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

      {/* ── Save to Catalog Modal ────────────────────────────────────────────── */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Save size={20} className="text-emerald-400" />
                Save Recording to Catalog
              </h3>
              <button
                onClick={() => setShowSaveModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Track Title
                </label>
                <input
                  type="text"
                  value={saveTitle}
                  onChange={(e) => setSaveTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                  placeholder="e.g. Acoustic Jam Take 1"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Artist Name
                </label>
                <input
                  type="text"
                  value={saveArtist}
                  onChange={(e) => setSaveArtist(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                  placeholder="e.g. My Studio Mic"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Genre (Optional)
                </label>
                <input
                  type="text"
                  value={saveGenre}
                  onChange={(e) => setSaveGenre(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                  placeholder="e.g. Jazz, Rock, Classical"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => setShowSaveModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveToCatalog}
                disabled={savingToDb}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold shadow-lg shadow-emerald-500/20 transition disabled:opacity-50"
              >
                {savingToDb ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <Save size={16} />
                )}
                <span>{savingToDb ? 'Saving...' : 'Confirm Save'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
