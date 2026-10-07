import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Search, CheckCircle2, XCircle, Info, X } from 'lucide-react';

export default function ModelMonitor() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters & Sort
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All'); // All, Active, Not Trained
  const [sortParam, setSortParam] = useState('Instrument Name'); // Instrument Name, Precision, Recall, F1-Score
  const [sortOrder, setSortOrder] = useState('asc'); // asc, desc

  // Modal
  const [selectedModel, setSelectedModel] = useState(null);

  useEffect(() => {
    api.getModelPerformance()
      .then(res => {
        setData(res.models || []);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  const trainedModels = data.filter(m => m.status === 'ACTIVE');

  // Averages
  const avgPrecision = trainedModels.length ? trainedModels.reduce((acc, m) => acc + m.precision, 0) / trainedModels.length : 0;
  const avgRecall = trainedModels.length ? trainedModels.reduce((acc, m) => acc + m.recall, 0) / trainedModels.length : 0;
  const avgF1 = trainedModels.length ? trainedModels.reduce((acc, m) => acc + m.f1Score, 0) / trainedModels.length : 0;

  // Filtering
  let filteredData = data.filter(m =>
    m.instrument.toLowerCase().includes(search.toLowerCase())
  );
  if (filter === 'Active') {
    filteredData = filteredData.filter(m => m.status === 'ACTIVE');
  } else if (filter === 'Not Trained') {
    filteredData = filteredData.filter(m => m.status === 'NOT_TRAINED');
  }

  // Sorting
  filteredData = [...filteredData].sort((a, b) => {
    let valA, valB;
    if (sortParam === 'Instrument Name') {
      valA = a.instrument;
      valB = b.instrument;
    } else if (sortParam === 'Precision') {
      valA = a.precision !== null ? a.precision : -1;
      valB = b.precision !== null ? b.precision : -1;
    } else if (sortParam === 'Recall') {
      valA = a.recall !== null ? a.recall : -1;
      valB = b.recall !== null ? b.recall : -1;
    } else if (sortParam === 'F1-Score') {
      valA = a.f1Score !== null ? a.f1Score : -1;
      valB = b.f1Score !== null ? b.f1Score : -1;
    }

    if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
    if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  if (loading) {
    return <div className="p-8 text-center text-slate-400">Loading model performance data...</div>;
  }

  return (
    <div className="space-y-8 animate-fade-in relative">
      {/* Header Info */}
      <div className="card p-6 bg-slate-800/50 border border-slate-700/50">
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Model Monitor</h1>
        <p className="text-slate-400">Evaluate the performance of individual musical instrument detectors.</p>
      </div>

      {/* Summary Section */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="card p-4 flex flex-col justify-center items-center text-center">
          <span className="text-slate-400 text-sm mb-1">Total Detectors</span>
          <span className="text-3xl font-light text-white">{data.length}</span>
        </div>
        <div className="card p-4 flex flex-col justify-center items-center text-center">
          <span className="text-slate-400 text-sm mb-1">Active Detectors</span>
          <span className="text-3xl font-light text-emerald-400">{trainedModels.length}</span>
        </div>
        <div className="card p-4 flex flex-col justify-center items-center text-center">
          <span className="text-slate-400 text-sm mb-1">Average Precision</span>
          <span className="text-2xl font-light text-indigo-400">{avgPrecision.toFixed(2)}%</span>
        </div>
        <div className="card p-4 flex flex-col justify-center items-center text-center">
          <span className="text-slate-400 text-sm mb-1">Average Recall</span>
          <span className="text-2xl font-light text-indigo-400">{avgRecall.toFixed(2)}%</span>
        </div>
        <div className="card p-4 flex flex-col justify-center items-center text-center">
          <span className="text-slate-400 text-sm mb-1">Average F1-Score</span>
          <span className="text-2xl font-light text-indigo-400">{avgF1.toFixed(2)}%</span>
        </div>
      </div>

      {/* Main List Section */}
      <div className="card p-6 line-clamp-none">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
          <h2 className="text-xl font-semibold text-white">Instrument Model Performance</h2>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <input
                type="text"
                placeholder="Search instrument..."
                className="bg-slate-900 border border-slate-700 text-white rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            {/* Filter */}
            <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-700">
              {['All', 'Active', 'Not Trained'].map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1 text-sm rounded-md transition-colors ${filter === f ? 'bg-indigo-600/30 text-indigo-300' : 'text-slate-400 hover:text-white'}`}
                >
                  {f}
                </button>
              ))}
            </div>

            {/* Sort */}
            <select
              className="bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 cursor-pointer"
              value={`${sortParam}|${sortOrder}`}
              onChange={e => {
                const [p, o] = e.target.value.split('|');
                setSortParam(p);
                setSortOrder(o);
              }}
            >
              <option value="Instrument Name|asc">Name (A-Z)</option>
              <option value="Instrument Name|desc">Name (Z-A)</option>
              <option value="Precision|desc">Precision (High to Low)</option>
              <option value="Recall|desc">Recall (High to Low)</option>
              <option value="F1-Score|desc">F1-Score (High to Low)</option>
            </select>
          </div>
        </div>

        <div className="space-y-4">
          {filteredData.map(m => (
            <div key={m.instrument} className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-5 hover:border-slate-600 transition-colors group">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-white">{m.instrument}</h3>
                <span className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${m.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'}`}>
                  {m.status === 'ACTIVE' ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                  {m.status === 'ACTIVE' ? 'Active' : 'Not Trained'}
                </span>
              </div>

              {m.status === 'ACTIVE' ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
                   <MetricBar label="Precision" value={m.precision} />
                   <MetricBar label="Recall" value={m.recall} />
                   <MetricBar label="F1-Score" value={m.f1Score} />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4 opacity-50">
                   <MetricBar label="Precision" value="—" />
                   <MetricBar label="Recall" value="—" />
                   <MetricBar label="F1-Score" value="—" />
                </div>
              )}

              <div className="flex justify-end border-t border-slate-700/50 pt-3 mt-2">
                <button
                  onClick={() => setSelectedModel(m)}
                  className="text-sm text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
                >
                  View Details
                </button>
              </div>
            </div>
          ))}
          {filteredData.length === 0 && (
            <div className="text-center py-10 text-slate-500">
              No instruments match your filters.
            </div>
          )}
        </div>
      </div>

      {/* Performance Comparison */}
      <div className="card p-6">
        <h2 className="text-xl font-semibold text-white mb-2">Performance Comparison</h2>
        <p className="text-sm text-slate-400 mb-6">Precision / Recall / F1-Score by Instrument</p>

        <div className="space-y-6">
          {trainedModels.map(m => (
            <div key={m.instrument} className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="w-32 text-sm font-medium text-slate-300 truncate" title={m.instrument}>
                {m.instrument}
              </div>
              <div className="flex-1 space-y-2">

                {/* Precision */}
                <div className="flex items-center gap-3 text-xs">
                  <div className="w-16 text-slate-400 text-right">Precision</div>
                  <div className="flex-1 h-3 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500/80 rounded-full" style={{ width: `${m.precision}%` }}></div>
                  </div>
                  <div className="w-12 text-slate-300 font-mono">{m.precision.toFixed(2)}%</div>
                </div>

                {/* Recall */}
                <div className="flex items-center gap-3 text-xs">
                  <div className="w-16 text-slate-400 text-right">Recall</div>
                  <div className="flex-1 h-3 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500/80 rounded-full" style={{ width: `${m.recall}%` }}></div>
                  </div>
                  <div className="w-12 text-slate-300 font-mono">{m.recall.toFixed(2)}%</div>
                </div>

                {/* F1-Score */}
                <div className="flex items-center gap-3 text-xs">
                  <div className="w-16 text-slate-400 text-right">F1-Score</div>
                  <div className="flex-1 h-3 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-purple-500/80 rounded-full" style={{ width: `${m.f1Score}%` }}></div>
                  </div>
                  <div className="w-12 text-slate-300 font-mono">{m.f1Score.toFixed(2)}%</div>
                </div>

              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal Overlay */}
      {selectedModel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700/60 rounded-2xl w-full max-w-md shadow-2xl relative overflow-hidden animate-fade-in-up">

            <div className="p-6 border-b border-slate-800 flex justify-between items-start">
              <div>
                <h3 className="text-xl font-semibold text-white">{selectedModel.instrument} Detector</h3>
                <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
                  Status:
                  <span className={`ml-1 ${selectedModel.status === 'ACTIVE' ? 'text-emerald-400' : 'text-slate-400'}`}>
                    {selectedModel.status === 'ACTIVE' ? 'Active' : 'Not Trained'}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedModel(null)}
                className="text-slate-500 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
                title="Close"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {selectedModel.status === 'ACTIVE' ? (
                <>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="bg-slate-800/50 rounded-lg p-3">
                      <div className="text-slate-400 text-xs mb-1">Precision</div>
                      <div className="text-lg text-white font-medium">{selectedModel.precision.toFixed(2)}%</div>
                    </div>
                    <div className="bg-slate-800/50 rounded-lg p-3">
                      <div className="text-slate-400 text-xs mb-1">Recall</div>
                      <div className="text-lg text-white font-medium">{selectedModel.recall.toFixed(2)}%</div>
                    </div>
                    <div className="bg-slate-800/50 rounded-lg p-3">
                      <div className="text-slate-400 text-xs mb-1">F1-Score</div>
                      <div className="text-lg text-white font-medium">{selectedModel.f1Score.toFixed(2)}%</div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between items-center py-2 border-b border-slate-800/60">
                      <span className="text-slate-400 text-sm">Model Version</span>
                      <span className="text-slate-200 text-sm font-medium">v1.0 (ResNetBCP)</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-slate-800/60">
                      <span className="text-slate-400 text-sm">Evaluation Dataset</span>
                      <span className="text-slate-200 text-sm font-medium">OpenMIC-2018</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-slate-800/60">
                      <span className="text-slate-400 text-sm">Last Evaluated</span>
                      <span className="text-slate-200 text-sm font-medium">2023-11-20</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-8">
                  <Info className="mx-auto text-slate-600 mb-3" size={32} />
                  <p className="text-slate-400">This detector has not been trained yet. No evaluation metrics available.</p>
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-900 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setSelectedModel(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium transition-colors focus:outline-none"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}

function MetricBar({ label, value }) {
  const isNumber = typeof value === 'number';

  return (
    <div>
      <div className="flex justify-between text-sm mb-1.5">
        <span className="text-slate-400">{label}</span>
        <span className="text-white font-medium">{isNumber ? `${value.toFixed(2)}%` : value}</span>
      </div>
      <div className="w-full bg-slate-800/80 rounded-full h-2 overflow-hidden shadow-inner">
        {isNumber && (
          <div
            className="bg-indigo-500 h-2 rounded-full transition-all duration-1000 ease-in-out"
            style={{ width: `${value}%` }}
          />
        )}
      </div>
    </div>
  );
}
