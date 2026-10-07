import React, { useState, useEffect } from 'react';
import { Menu, Activity, Server, Github, Settings } from 'lucide-react';
import { useLocation, Link } from 'react-router-dom';
import { api } from '../services/api';

export default function Navbar({ setSidebarOpen }) {
  const location = useLocation();
  const [health, setHealth] = useState(true);

  useEffect(() => {
    // Simple ping to check if gateway is up
    api.getSongs({ page_size: 1 })
       .then(() => setHealth(true))
       .catch(() => setHealth(false));
  }, [location.pathname]);

  const getPageTitle = () => {
    const path = location.pathname;
    if (path === '/dashboard') return 'Platform Dashboard';
    if (path === '/analyze') return 'Audio Analysis Engine';
    if (path === '/live') return 'Live Recognition';
    if (path === '/catalog') return 'Music Catalog & Auto-DJ';
    if (path === '/history') return 'Analysis History';
    if (path === '/recommendations') return 'AI Discovery';
    if (path === '/analytics') return 'ML Analytics';
    if (path === '/settings') return 'System Settings';
    if (path === '/model-monitor') return 'Model Monitor';
    return 'MusicTalk Studio';
  };

  return (
    <header className="sticky top-0 z-30 bg-slate-900 border-b border-slate-700/60 shadow-sm backdrop-blur-md bg-opacity-80">
      <div className="flex items-center justify-between px-6 py-4">
        {/* Left Side: Mobile Menu + Page Title */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <Menu size={24} />
          </button>

          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold tracking-tight text-white hidden sm:block">
              {getPageTitle()}
            </h2>
            {/* Health Indicator Badge */}
            <span className={`hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
              health ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'
            }`}>
              <Activity size={12} className={health ? 'animate-pulse' : ''} />
              {health ? 'API Online' : 'API Offline'}
            </span>
          </div>
        </div>

        {/* Right Side: Meaningful Actions instead of dummy Search/User */}
        <div className="flex items-center gap-4">
          <Link
            to="/model-monitor"
            className="hidden sm:flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-white transition-colors"
            title="View Model Performance"
          >
            <Server size={18} /> Model Monitor
          </Link>

          <div className="h-6 w-px bg-slate-700 mx-1 hidden sm:block"></div>

          <Link
            to="/settings"
            className="flex items-center gap-2 hover:bg-slate-800 p-2 sm:pr-4 rounded-full transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-600 flex items-center justify-center shadow-inner hover:border-indigo-400 transition-colors">
              <Settings size={16} className="text-slate-300" />
            </div>
            <span className="text-sm font-medium text-slate-200 hidden sm:block">Settings</span>
          </Link>
        </div>
      </div>
    </header>
  );
}