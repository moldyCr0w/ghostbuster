import React from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import Dashboard  from './pages/Dashboard';
import Candidates from './pages/Candidates';
import Reqs       from './pages/Reqs';
import Pipeline   from './pages/Pipeline';
import Settings   from './pages/Settings';

const navItem = ({ isActive }) =>
  `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
    isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
  }`;

export default function App() {
  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 bg-slate-900 text-white flex flex-col shrink-0">
        <div className="px-6 py-5 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="text-2xl">👻</span>
            <div>
              <h1 className="text-base font-bold leading-tight">GhostBuster</h1>
              <p className="text-slate-400 text-xs">Hiring Funnel Reminders</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-0.5">
          <NavLink to="/"           end className={navItem}>📊 Dashboard</NavLink>
          <NavLink to="/pipeline"       className={navItem}>🔀 Pipeline</NavLink>
          <NavLink to="/candidates"     className={navItem}>👥 Candidates</NavLink>
          <NavLink to="/reqs"           className={navItem}>📋 Requisitions</NavLink>
          <NavLink to="/settings"       className={navItem}>⚙️ Settings</NavLink>
        </nav>
      </aside>

      {/* Page content */}
      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/"           element={<Dashboard />}  />
          <Route path="/pipeline"   element={<Pipeline />}   />
          <Route path="/candidates" element={<Candidates />} />
          <Route path="/reqs"       element={<Reqs />}       />
          <Route path="/settings"   element={<Settings />}   />
        </Routes>
      </main>
    </div>
  );
}
