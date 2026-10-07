import React, { useState, useEffect } from 'react';
import { Clock, Music, Loader2, Calendar, Disc, CheckCircle2 } from 'lucide-react';
import { api } from '../services/api';

export default function History() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const data = await api.getSongs({ page_size: 50 });
        const analyzed = (data.songs || []).filter(s => s.status === "DONE" && s.instruments && Object.keys(s.instruments).length > 0);
        setHistory(analyzed);
      } catch (err) {
        console.error("Failed to fetch history:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, []);

  if (loading) return (
    <div className="flex justify-center items-center py-32">
      <Loader2 className="animate-spin text-indigo-500" size={40} />
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
          <Clock className="text-indigo-400" />
          Analysis History
        </h1>
        <p className="text-slate-400 text-sm">Recently analyzed songs and detected musical instrument profiles.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {history.map(song => {
          let instLabels = [];
          if (song.instruments) {
             const sorted = Object.entries(song.instruments)
                .sort((a,b) => {
                   const confA = a[1].confidence !== undefined ? a[1].confidence : a[1];
                   const confB = b[1].confidence !== undefined ? b[1].confidence : b[1];
                   return confB - confA;
                });
             instLabels = sorted.slice(0, 4).map(i => i[0].replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()));
          }

          const date = song.created_at ? new Date(song.created_at).toLocaleDateString() : 'Recent';

          return (
            <div
              key={song.id}
              className="bg-slate-900 border border-slate-700/50 rounded-2xl p-5 hover:border-slate-600 transition-all group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start gap-3.5 mb-4">
                  <div className="bg-indigo-500/10 p-3 rounded-xl border border-indigo-500/20 text-indigo-400 group-hover:scale-105 transition-transform">
                    <Music size={20} />
                  </div>
                  <div className="overflow-hidden">
                    <h3 className="text-base font-bold text-slate-100 truncate group-hover:text-white transition-colors">{song.title || "Unknown Track"}</h3>
                    <p className="text-xs text-slate-400 truncate">{song.artist || "Unknown Artist"}</p>
                  </div>
                </div>

                <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-3 mb-4">
                  <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider block mb-1">Detected Profile</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {instLabels.map((label, idx) => (
                      <span key={idx} className="bg-slate-900 text-slate-300 text-xs px-2 py-0.5 rounded border border-slate-700">
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500 border-t border-slate-800/80 pt-3">
                <div className="flex items-center gap-1.5">
                  <Calendar size={13} /> {date}
                </div>
                <div className="flex items-center gap-1 text-emerald-500 font-medium">
                  <CheckCircle2 size={13} /> Analyzed
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {history.length === 0 && (
         <div className="text-center py-24 bg-slate-900 border border-slate-800 rounded-2xl p-8">
           <Disc size={40} className="mx-auto text-slate-600 mb-3" />
           <h3 className="text-lg font-bold text-slate-300 mb-1">No Analysis History Found</h3>
           <p className="text-slate-500 text-sm max-w-sm mx-auto">Upload an audio file on the Analyze page to view your complete instrument recognition log.</p>
         </div>
      )}
    </div>
  );
}
