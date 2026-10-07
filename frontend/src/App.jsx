import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import Recognize from './pages/Recognize';
import LiveRecord from './pages/LiveRecord';
import Catalog from './pages/Catalog';
import History from './pages/History';
import Discover from './pages/Discover';
import MLEvaluation from './pages/MLEvaluation';
import ModelMonitor from './pages/ModelMonitor';

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <Router>
      <div className="flex bg-[#0f172a] min-h-screen text-slate-50 font-sans font-light">
        <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

        <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
          <Navbar setSidebarOpen={setSidebarOpen} />

          <main className="flex-1 overflow-x-hidden overflow-y-auto bg-slate-900/50 p-6 relative">
            <div className="max-w-7xl mx-auto space-y-6">
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/analyze" element={<Recognize />} />
                <Route path="/live" element={<LiveRecord />} />
                <Route path="/catalog" element={<Catalog />} />
                <Route path="/history" element={<History />} />
                <Route path="/recommendations" element={<Discover />} />
                <Route path="/analytics" element={<MLEvaluation />} />
                <Route path="/model-monitor" element={<ModelMonitor />} />
                <Route path="/settings" element={
                  <div className="card p-8">
                    <h1 className="text-3xl font-bold tracking-tight text-white mb-6">Settings</h1>
                    <p className="text-slate-400">Settings and preferences configuration panel.</p>
                  </div>
                } />
              </Routes>
            </div>
          </main>
        </div>
      </div>
    </Router>
  );
}
