import React, { useState } from 'react';
import { ThumbsUp, ThumbsDown, Check, Send, BrainCircuit } from 'lucide-react';
import { api } from '../services/api';

export default function FeedbackWidget({ instruments }) {
  const [feedbackState, setFeedbackState] = useState({}); // { [instName]: "correct" | "wrong" | "submitted" }
  const [correction, setCorrection] = useState({}); // { [instName]: "chosen_correction" }

  const ALL_INSTRUMENTS = ["Piano", "Acoustic Guitar", "Electric Guitar", "Violin", "Cello", "Flute", "Clarinet", "Saxophone", "Trumpet", "Organ", "Voice", "Drums", "Bass", "Synthesizer"];

  const handleCorrect = (inst) => {
    setFeedbackState(prev => ({ ...prev, [inst]: "submitted" }));
    // API call to log positive
  };

  const handleWrong = (inst) => {
    setFeedbackState(prev => ({ ...prev, [inst]: "wrong" }));
  };

  const handleSubmitCorrection = (inst) => {
    setFeedbackState(prev => ({ ...prev, [inst]: "submitted" }));
    // API call to log negative & correction
  };

  if (!instruments || instruments.length === 0) return null;

  return (
    <div className="mt-12 bg-slate-900 border border-slate-700/50 rounded-2xl p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-6 border-b border-slate-800 pb-4">
        <BrainCircuit size={24} className="text-orange-400" />
        <h2 className="text-xl font-bold text-white">Detection Feedback <span className="text-sm font-normal text-slate-500 ml-2">(Continuous Learning)</span></h2>
      </div>

      <div className="flex flex-col gap-4">
        {instruments.map(item => {
          const instName = item.instrument;
          const label = instName.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
          const state = feedbackState[instName];
          const percent = Math.round(item.confidence * 100);

          return (
            <div key={instName} className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-5 hover:border-slate-600 transition-colors">
              <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                <div className="flex items-center gap-3 text-lg font-bold text-white">
                  {label}
                  <span className="text-sm font-medium text-slate-400 bg-slate-900 px-2 py-0.5 rounded-md border border-slate-700">{percent}%</span>
                </div>

                {state === "submitted" ? (
                  <div className="flex items-center gap-2 text-emerald-500 font-medium bg-emerald-500/10 px-4 py-2 rounded-lg border border-emerald-500/20">
                    <Check size={18} /> Recorded, Thank You!
                  </div>
                ) : state !== "wrong" ? (
                  <div className="flex gap-2">
                    <button
                        onClick={() => handleCorrect(instName)}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-slate-900 border border-slate-700 hover:bg-slate-800 hover:border-emerald-500/50 px-4 py-2 rounded-lg text-slate-300 hover:text-emerald-400 transition-colors"
                    >
                      <ThumbsUp size={16} /> Correct
                    </button>
                    <button
                        onClick={() => handleWrong(instName)}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-slate-900 border border-slate-700 hover:bg-slate-800 hover:border-red-500/50 px-4 py-2 rounded-lg text-slate-300 hover:text-red-400 transition-colors"
                    >
                      <ThumbsDown size={16} /> Wrong
                    </button>
                  </div>
                ) : null}
              </div>

              {state === "wrong" && (
                <div className="mt-5 bg-slate-900/80 p-5 rounded-lg border border-slate-700 shadow-inner animate-in slide-in-from-top-2 duration-300">
                  <p className="mb-4 font-semibold text-slate-200">What instrument is actually present here?</p>
                  <div className="flex flex-wrap gap-2">
                    {ALL_INSTRUMENTS.filter(i => i.toLowerCase() !== label.toLowerCase()).map(opt => (
                      <button
                        key={opt}
                        onClick={() => setCorrection(prev => ({ ...prev, [instName]: opt }))}
                        className={`px-3 py-1.5 rounded-md text-sm transition-colors border ${
                            correction[instName] === opt
                                ? 'bg-indigo-500 border-indigo-500 text-white shadow-md shadow-indigo-500/25'
                                : 'bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                    <button
                        onClick={() => setCorrection(prev => ({ ...prev, [instName]: "None" }))}
                        className={`px-3 py-1.5 rounded-md text-sm transition-colors border ${
                            correction[instName] === "None"
                                ? 'bg-red-500 border-red-500 text-white shadow-md shadow-red-500/25'
                                : 'bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        None
                      </button>
                  </div>

                  <div className="mt-5 pt-4 border-t border-slate-800 flex justify-end">
                    <button
                      onClick={() => handleSubmitCorrection(instName)}
                      disabled={!correction[instName]}
                      className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold transition-all ${
                        correction[instName]
                            ? 'bg-indigo-500 hover:bg-indigo-600 text-white shadow-md shadow-indigo-500/25'
                            : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      <Send size={16} /> Submit Correction
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
