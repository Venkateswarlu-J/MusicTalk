import React from 'react';
import { Activity, Clock } from 'lucide-react';

export default function InstrumentTimeline({ timeline, duration }) {
  if (!timeline || timeline.length === 0 || !duration || duration <= 0) return null;

  const validTimeline = timeline.filter(
    (item) => item.segments && item.segments.length > 0
  );

  if (validTimeline.length === 0) return null;

  const formatSec = (s) => {
    const min = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-slate-900/90 border border-slate-700/60 rounded-2xl p-6 w-full shadow-lg backdrop-blur-md">
      <div className="flex items-center justify-between mb-6 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-indigo-500/10 rounded-xl text-indigo-400">
            <Activity size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white tracking-tight">
              Temporal Instrument Timeline
            </h3>
            <p className="text-xs text-slate-400">
              Active detection segments across the song's duration
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-800/60 px-3 py-1.5 rounded-full border border-slate-700">
          <Clock size={14} className="text-indigo-400" />
          <span>Total: {formatSec(duration)}</span>
        </div>
      </div>

      <div className="space-y-4">
        {validTimeline.map(({ instrument, segments }) => {
          return (
            <div
              key={instrument}
              className="flex items-center gap-4 group hover:bg-slate-800/30 p-1.5 rounded-xl transition-colors"
            >
              <div
                className="w-36 text-sm font-semibold text-slate-300 capitalize truncate shrink-0 group-hover:text-white transition-colors"
                title={instrument.replace(/_/g, ' ')}
              >
                {instrument.replace(/_/g, ' ')}
              </div>

              <div className="flex-1 h-7 bg-slate-950/80 rounded-lg relative overflow-hidden border border-slate-800 shadow-inner group-hover:border-slate-700 transition-colors">
                {/* Subtle grid pattern background */}
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#334155_1px,transparent_1px)] bg-[size:10%_100%] opacity-20 pointer-events-none" />

                {segments.map((seg, idx) => {
                  const left = Math.max(0, Math.min(100, (seg.start / duration) * 100));
                  const width = Math.max(
                    1,
                    Math.min(100 - left, ((seg.end - seg.start) / duration) * 100)
                  );

                  return (
                    <div
                      key={idx}
                      className="absolute h-full top-0 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-400 rounded shadow-[0_0_10px_rgba(99,102,241,0.5)] opacity-90 group-hover:opacity-100 transition-all hover:brightness-125 cursor-pointer"
                      style={{
                        left: `${left}%`,
                        width: `${width}%`,
                      }}
                      title={`${instrument.replace(/_/g, ' ')}: ${seg.start.toFixed(1)}s - ${seg.end.toFixed(1)}s`}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Time axis */}
      <div className="flex justify-between items-center mt-4 ml-40 text-xs font-mono text-slate-500">
        <span>00:00</span>
        <div className="flex-1 relative mx-4">
          <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-px bg-slate-800" />
          <div className="absolute top-1/2 left-1/4 -translate-x-1/2 -translate-y-1/2 w-1 h-1.5 bg-slate-700 rounded-full" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-2.5 bg-indigo-500/50 rounded-full" />
          <div className="absolute top-1/2 left-3/4 -translate-x-1/2 -translate-y-1/2 w-1 h-1.5 bg-slate-700 rounded-full" />
        </div>
        <span>{formatSec(duration)}</span>
      </div>
    </div>
  );
}
