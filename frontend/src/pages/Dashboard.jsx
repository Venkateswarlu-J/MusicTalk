import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Music, Upload, Radio, Library, Activity, Compass, Server, Zap, CheckCircle2, XCircle } from 'lucide-react';
import { api } from '../services/api';

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalSongs: 0,
    totalAnalyses: 0,
    totalInstruments: 0,
    liveSessions: 14,
    recommendationsCount: 142,
  });

  const [loading, setLoading] = useState(true);
  const [healthStatus, setHealthStatus] = useState(null);
  const [modelStatusList, setModelStatusList] = useState([]);
  const [distribution, setDistribution] = useState([]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const songsReq = await api.getSongs({ page_size: 100 }).catch(() => ({ songs: [] }));
        const healthReq = await api.getRecognitionHealth().catch(() => null);
        const modelsReq = await api.getModelStatus().catch(() => ({ models: [] }));

        const songs = songsReq.songs || [];
        const analyses = songs.filter(s => s.status === 'DONE').length;

        // Calculate actual occurrences
        const counts = {};
        let totalOccurrences = 0;
        songs.forEach(song => {
          if (song.instruments) {
            Object.keys(song.instruments).forEach(inst => {
              counts[inst] = (counts[inst] || 0) + 1;
              totalOccurrences += 1;
            });
          }
        });

        const colors = ['bg-indigo-500', 'bg-blue-500', 'bg-purple-500', 'bg-pink-500', 'bg-orange-500', 'bg-emerald-500'];
        const dist = Object.entries(counts)
          .map(([name, count], idx) => ({
            name: name.replace('_', ' '),
            pct: totalOccurrences > 0 ? Math.round((count / songs.length) * 100) : 0,
            color: colors[idx % colors.length]
          }))
          .sort((a, b) => b.pct - a.pct)
          .slice(0, 6);

        setDistribution(dist);

        setStats(prev => ({
          ...prev,
          totalSongs: songs.length,
          totalAnalyses: analyses,
          totalInstruments: healthReq ? healthReq.total_configured_detectors : 16,
        }));

        setHealthStatus(healthReq);
        setModelStatusList(modelsReq.models || []);
      } catch (err) {
        console.error("Dashboard fetch error", err);
      } finally {
        setLoading(false);
      }
    };
    fetchDashboardData();
  }, []);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-1">Dashboard</h1>
          <p className="text-slate-400 font-light">Welcome back to MusicTalk AI Platform.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/analyze" className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 shadow-sm shadow-indigo-500/20">
            <Upload size={16} /> <span>Analyze File</span>
          </Link>
          <Link to="/live" className="px-4 py-2 bg-slate-800 border border-slate-700 hover:bg-slate-700 hover:border-slate-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2">
            <Radio size={16} className="text-pink-500" /> <span>Start Live Session</span>
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Total Songs', value: stats.totalSongs, icon: Music, color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
          { label: 'Analyses Run', value: stats.totalAnalyses, icon: Activity, color: 'text-blue-400', bg: 'bg-blue-500/10' },
          { label: 'Instruments', value: stats.totalInstruments, icon: Library, color: 'text-purple-400', bg: 'bg-purple-500/10' },
          { label: 'Live Sessions', value: stats.liveSessions, icon: Radio, color: 'text-pink-400', bg: 'bg-pink-500/10' },
          { label: 'Insights', value: stats.recommendationsCount, icon: Compass, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
        ].map((c, i) => (
          <div key={i} className="bg-slate-900 border border-slate-700/50 rounded-2xl p-5 hover:border-slate-600 transition-colors group">
            <div className="flex justify-between items-start mb-3">
              <span className="text-slate-400 text-sm font-medium">{c.label}</span>
              <div className={`p-2 rounded-lg ${c.bg} group-hover:scale-110 transition-transform`}>
                <c.icon size={18} className={c.color} />
              </div>
            </div>
            <div className="text-2xl font-bold text-white">
              {loading ? <div className="h-8 w-16 bg-slate-800 animate-pulse rounded"></div> : c.value}
            </div>
          </div>
        ))}
      </div>

      {/* Dynamic Model Status Section */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-lg font-semibold text-white">Configured Model Detectors</h3>
            <p className="text-sm text-slate-400">Real-time status of weights and baseline performance on disk.</p>
          </div>
          <span className="text-xs font-semibold bg-indigo-500/10 text-indigo-400 px-3 py-1 rounded-full border border-indigo-500/20">
            {modelStatusList.filter(m => m.trained).length} Active Checkpoints
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 pt-2">
          {modelStatusList.map((m) => (
            <div key={m.instrument} className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-3 flex flex-col justify-between">
              <div className="flex justify-between items-start mb-2">
                <span className="capitalize text-sm font-bold text-slate-200 truncate">{m.instrument.replace('_', ' ')}</span>
                {m.trained ? (
                  <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                ) : (
                  <XCircle size={16} className="text-slate-600 shrink-0" />
                )}
              </div>
              <div className="text-xs">
                {m.trained ? (
                  <div className="flex justify-between items-center text-slate-400">
                    <span>Baseline:</span>
                    <span className="font-bold text-slate-200">{m.accuracy ? `${m.accuracy}%` : 'Trained'}</span>
                  </div>
                ) : (
                  <span className="text-slate-500 italic">Not trained yet</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Infrastructure Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-slate-900 border border-slate-700/50 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-white">Instrument Distribution</h3>
              <p className="text-sm text-slate-400">Relative occurrence across analyzed catalog.</p>
            </div>
            <button className="text-xs font-medium text-indigo-400 hover:text-indigo-300">View Full Report</button>
          </div>

          <div className="space-y-5 mt-4">
            {distribution.length === 0 ? (
              <p className="text-slate-500 text-sm italic">No instrument occurrence data yet. Analyze audio files to populate distribution.</p>
            ) : (
              distribution.map(item => (
                <div key={item.name}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="text-slate-300 font-medium capitalize">{item.name}</span>
                    <span className="font-bold text-slate-400">{item.pct}%</span>
                  </div>
                  <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full ${item.color} rounded-full`} style={{ width: `${item.pct}%` }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6 shadow-sm flex flex-col">
          <div className="mb-6">
             <h3 className="text-lg font-semibold text-white">System Infrastructure</h3>
             <p className="text-sm text-slate-400">Services and cluster health status.</p>
          </div>

          <div className="space-y-3 flex-1 mb-6">
            <div className="flex items-center justify-between p-3.5 bg-slate-800/50 rounded-xl border border-slate-700/50">
              <div className="flex items-center gap-3">
                <Server size={18} className="text-slate-400" />
                <span className="text-sm font-medium text-slate-200">Recognition API</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${healthStatus ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></span>
                <span className={`text-xs font-semibold ${healthStatus ? 'text-emerald-500' : 'text-red-500'}`}>
                  {healthStatus ? 'Operational' : 'Offline'}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between p-3.5 bg-slate-800/50 rounded-xl border border-slate-700/50">
              <div className="flex items-center gap-3">
                <Library size={18} className="text-slate-400" />
                <span className="text-sm font-medium text-slate-200">Catalog Engine</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-xs font-semibold text-emerald-500">Operational</span>
              </div>
            </div>

            <div className="flex items-center justify-between p-3.5 bg-slate-800/50 rounded-xl border border-slate-700/50">
              <div className="flex items-center gap-3">
                <Zap size={18} className="text-slate-400" />
                <span className="text-sm font-medium text-slate-200">ML Analytics</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-xs font-semibold text-emerald-500">Operational</span>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-5 space-y-2 mt-auto">
             <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Model Version</span>
                <span className="text-slate-300 font-medium">v2.0 (OpenMIC)</span>
             </div>
             <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Model Window</span>
                <span className="text-slate-300 font-medium">3.0s / 1.5s Hop</span>
             </div>
             <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Detectors</span>
                <span className="text-slate-300 font-medium">{healthStatus?.trained_detectors?.length || 0} Built</span>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
