import React from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Music,
  Mic,
  Activity,
  Disc,
  Radio,
  Sliders,
  Sparkles,
} from 'lucide-react';

const INSTRUMENT_ICONS = {
  piano: Music,
  acoustic_guitar: Music,
  electric_guitar: Radio,
  violin: Music,
  cello: Music,
  flute: Activity,
  clarinet: Activity,
  saxophone: Activity,
  trumpet: Activity,
  organ: Sliders,
  voice: Mic,
  drums: Disc,
  bass: Sliders,
  synthesizer: Sliders,
  cymbals: Disc,
  mallet_percussion: Disc,
};

export default function InstrumentCard({
  instrument,
  confidence,
  occurrence,
  modelAvailable,
  model_available,
  threshold_used,
}) {
  const isAvailable =
    modelAvailable ??
    model_available ??
    (confidence !== null && confidence !== undefined);

  const percentConf =
    confidence !== null && confidence !== undefined
      ? Math.round(confidence * 100)
      : null;

  const percentOcc =
    occurrence !== null && occurrence !== undefined
      ? Math.round(occurrence * 100)
      : null;

  const thresholdPct = threshold_used ? Math.round(threshold_used * 100) : 50;

  let state = 'Not Trained';
  if (isAvailable && percentConf !== null) {
    if (percentConf >= thresholdPct) {
      state = 'Detected';
    } else {
      state = 'Not Detected';
    }
  }

  const getStateStyles = () => {
    switch (state) {
      case 'Detected':
        return {
          bg: 'bg-emerald-500/10',
          color: 'text-emerald-400',
          border: 'border-emerald-500/40 hover:border-emerald-400/60',
          glow: 'shadow-[0_0_15px_rgba(16,185,129,0.15)]',
          fill: 'bg-gradient-to-r from-emerald-500 to-teal-400',
          icon: <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />,
          badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
        };
      case 'Not Detected':
        return {
          bg: 'bg-slate-800/40',
          color: 'text-slate-400',
          border: 'border-slate-700/60 hover:border-slate-600',
          glow: '',
          fill: 'bg-gradient-to-r from-slate-600 to-slate-500',
          icon: <XCircle size={15} className="text-slate-400 shrink-0" />,
          badgeBg: 'bg-slate-800 text-slate-400 border-slate-700',
        };
      case 'Not Trained':
      default:
        return {
          bg: 'bg-slate-900/40',
          color: 'text-slate-500',
          border: 'border-slate-800 hover:border-slate-700',
          glow: '',
          fill: 'bg-slate-700',
          icon: <AlertCircle size={15} className="text-slate-500 shrink-0" />,
          badgeBg: 'bg-slate-900/80 text-slate-500 border-slate-800',
        };
    }
  };

  const styles = getStateStyles();
  const rawKey = (instrument || '').toLowerCase().replace(/\s+/g, '_');
  const IconComponent = INSTRUMENT_ICONS[rawKey] || Music;
  const displayName = (instrument || '').replace(/_/g, ' ');

  return (
    <div
      className={`bg-slate-900/80 border ${styles.border} ${styles.glow} backdrop-blur-md rounded-2xl p-5 flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 group relative overflow-hidden`}
    >
      {/* Background ambient gradient for detected instruments */}
      {state === 'Detected' && (
        <div className="absolute -top-12 -right-12 w-28 h-28 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
      )}

      <div>
        {/* Header: Instrument Name + Icon + Status Badge */}
        <div className="flex items-start justify-between gap-2 mb-4">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div
              className={`p-2 rounded-xl shrink-0 transition-transform group-hover:scale-110 ${
                state === 'Detected'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              <IconComponent size={18} />
            </div>
            <h3
              className={`capitalize text-base font-bold tracking-tight truncate ${
                state === 'Detected'
                  ? 'text-white'
                  : state === 'Not Trained'
                  ? 'text-slate-500'
                  : 'text-slate-200'
              }`}
              title={displayName}
            >
              {displayName}
            </h3>
          </div>

          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider border shrink-0 ${styles.badgeBg}`}
          >
            {styles.icon}
            <span>{state}</span>
          </div>
        </div>

        {/* Body Content */}
        {state === 'Not Trained' ? (
          <div className="py-3 px-3.5 text-center text-slate-500 text-xs italic bg-slate-950/40 rounded-xl border border-slate-800/80">
            Awaiting OpenMIC dataset alignment
          </div>
        ) : (
          <div className="space-y-3">
            {/* Confidence Bar */}
            <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800/80">
              <div className="flex justify-between items-center mb-1.5 text-xs">
                <span className="text-slate-400 font-medium">Confidence Score</span>
                <span
                  className={`font-bold ${
                    state === 'Detected' ? 'text-emerald-400' : 'text-slate-300'
                  }`}
                >
                  {percentConf}%
                </span>
              </div>
              <div className="h-2 bg-slate-800/80 rounded-full overflow-hidden">
                <div
                  className={`h-full ${styles.fill} rounded-full transition-all duration-700 ease-out`}
                  style={{ width: `${percentConf}%` }}
                />
              </div>
            </div>

            {/* Occurrence (Coverage) Bar if present */}
            {percentOcc !== null && (
              <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800/80">
                <div className="flex justify-between items-center mb-1.5 text-xs">
                  <span className="text-slate-400 font-medium">Track Occurrence</span>
                  <span className="font-bold text-indigo-400">{percentOcc}%</span>
                </div>
                <div className="h-2 bg-slate-800/80 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-400 rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${percentOcc}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
