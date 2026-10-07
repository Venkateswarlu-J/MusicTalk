import React from 'react';
import { NavLink } from 'react-router-dom';
import { Music, LayoutDashboard, Upload, Radio, Library, History, Compass, Activity, Settings, User, X } from 'lucide-react';

export default function Sidebar({ sidebarOpen, setSidebarOpen }) {
  const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/analyze', label: 'Analyze Song', icon: Upload },
    { path: '/live', label: 'Live Detect', icon: Radio },
    { path: '/catalog', label: 'Catalog', icon: Library },
    { path: '/history', label: 'History', icon: History },
    { path: '/recommendations', label: 'Discover', icon: Compass },
    { path: '/analytics', label: 'ML Analytics', icon: Activity },
  ];

  const bottomNavItems = [
    { path: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <>
      <div
        className={`fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-40 transition-opacity duration-300 md:hidden ${sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setSidebarOpen(false)}
      ></div>

      <aside className={`fixed md:static inset-y-0 left-0 w-64 bg-[#111c34] border-r border-[#1e293b] flex flex-col h-full z-50 transform transition-transform duration-300 shadow-2xl md:shadow-none ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="p-6 flex justify-between items-center bg-[#111c34] relative z-10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2 rounded-xl shadow-lg shadow-indigo-500/20 text-white">
              <Music size={24} />
            </div>
            <span className="text-xl font-bold tracking-tight text-white">InstruSense</span>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="md:hidden text-slate-400 hover:text-white">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1 mt-2 custom-scrollbar">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider pl-3 mb-2 block">Menu</span>
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group relative ${
                  isActive
                    ? 'bg-indigo-500/10 text-indigo-400 font-medium'
                    : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon size={20} className={isActive ? 'text-indigo-400' : 'text-slate-500 group-hover:text-slate-300'} />
                  <span>{item.label}</span>
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-indigo-500 rounded-r-full shadow-[0_0_8px_rgba(99,102,241,0.5)]"></div>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </div>

        <div className="p-4 shrink-0">
          <div className="border-t border-[#1e293b] pt-4 mb-2 space-y-1">
            {bottomNavItems.map((item) => (
               <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group relative ${
                    isActive
                      ? 'bg-indigo-500/10 text-indigo-400 font-medium'
                      : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                  }`
                }
               >
                 <item.icon size={20} className="text-slate-500 group-hover:text-slate-300" />
                 <span>{item.label}</span>
               </NavLink>
            ))}
          </div>

          <div className="bg-[#1e293b]/50 p-4 rounded-xl border border-[#334155]/50 flex items-center justify-between hover:bg-[#1e293b] transition-colors cursor-pointer group mt-2">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center shrink-0 border border-slate-700">
                <User size={18} className="text-slate-400 group-hover:text-white transition-colors" />
              </div>
              <div className="truncate">
                <p className="text-sm font-medium text-slate-200 truncate">Admin User</p>
                <p className="text-xs text-slate-500 truncate">Free Plan</p>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
