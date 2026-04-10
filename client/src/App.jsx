import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { api } from './api';
import Dashboard  from './pages/Dashboard';
import Candidates from './pages/Candidates';
import Reqs       from './pages/Reqs';
import Pipeline   from './pages/Pipeline';
import Board      from './pages/Board';
import Settings   from './pages/Settings';
import Stats      from './pages/Stats';
import Pokedex    from './pages/Pokedex';
import Login      from './pages/Login';
import HMView     from './pages/HMView';
import HMLogin    from './pages/HMLogin';
import Schedule        from './pages/Schedule';
import JobPosting      from './pages/JobPosting';
import SchedulingTool  from './pages/SchedulingTool';

/* ── Notification bell (sidebar) ─────────────────────────────── */
function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen]                   = useState(false);
  const navigate                          = useNavigate();

  const load = useCallback(async () => {
    const data = await api.getNotifications();
    setNotifications(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const unread = notifications.filter(n => !n.is_read).length;

  const handleToggle = () => {
    setOpen(o => !o);
    if (!open) load(); // refresh list on open
  };

  const handleMarkAll = async () => {
    await api.markAllRead();
    setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
  };

  // Click a notification: mark read, close panel, open candidate on the Board
  const handleNotificationClick = async (n) => {
    if (!n.is_read) {
      await api.markRead(n.id);
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, is_read: 1 } : x));
    }
    setOpen(false);
    navigate('/board', { state: { openCandidateId: n.candidate_id } });
  };

  function fmtShort(iso) {
    try {
      return new Date(iso).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' });
    } catch { return iso; }
  }

  return (
    <div>
      <button
        onClick={handleToggle}
        className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
          open
            ? 'bg-slate-800 text-white'
            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
        }`}
      >
        <span>🔔</span>
        <span>Notifications</span>
        {unread > 0 && (
          <span className="ml-auto px-1.5 py-0.5 bg-red-500 text-white text-xs font-bold rounded-full min-w-[1.25rem] text-center leading-none">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="mt-1 bg-slate-800 rounded-lg overflow-hidden">
          {notifications.length === 0 ? (
            <p className="px-4 py-3 text-xs text-slate-400 italic">No HM decisions yet.</p>
          ) : (
            <>
              {unread > 0 && (
                <button
                  onClick={handleMarkAll}
                  className="w-full text-left px-4 py-2 text-xs text-slate-400 hover:text-white border-b border-slate-700 transition-colors"
                >
                  ✓ Mark all as read
                </button>
              )}
              <div className="max-h-72 overflow-y-auto divide-y divide-slate-700">
                {notifications.map(n => (
                  <div
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={`px-4 py-3 flex items-start gap-2.5 cursor-pointer hover:bg-slate-700 transition-colors ${
                      n.is_read ? 'opacity-50' : ''
                    }`}
                  >
                    <span className="text-base shrink-0 mt-0.5">
                      {n.decision === 'forward' ? '✅' : '❌'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-white leading-tight truncate">
                        {n.candidate_name}
                      </p>
                      <p className="text-xs text-slate-300 mt-0.5">
                        {n.decision === 'forward'
                          ? `Forwarded → ${n.stage_name || 'next stage'}`
                          : 'Declined by HM'}
                        {n.req_title ? ` · ${n.req_title}` : ''}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {fmtShort(n.created_at)}
                        <span className="ml-2 text-slate-500">→ Open profile</span>
                      </p>
                    </div>
                    {!n.is_read && (
                      <span className="shrink-0 w-2 h-2 rounded-full bg-blue-400 mt-1.5" />
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Nav link style ──────────────────────────────────────────── */
const navItem = ({ isActive }) =>
  `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
    isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
  }`;

/* ── Authenticated shell (sidebar + page content) ────────────── */
function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

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
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          <NavLink to="/"           end className={navItem}>📊 Dashboard</NavLink>
          <NavLink to="/pipeline"       className={navItem}>🔀 Pipeline</NavLink>
          <NavLink to="/board"          className={navItem}>🗂️ Board</NavLink>
          <NavLink to="/candidates"     className={navItem}>👥 Candidates</NavLink>
          <NavLink to="/reqs"           className={navItem}>📋 Requisitions</NavLink>
          <NavLink to="/stats"          className={navItem}>📈 Stats</NavLink>
          <NavLink to="/pokedex"        className={navItem}>🔴 Pokédex</NavLink>
          <NavLink to="/scheduling"     className={navItem}>📅 Scheduling</NavLink>
          <NavLink to="/settings"       className={navItem}>⚙️ Settings</NavLink>
          <div className="pt-1">
            <NotificationBell />
          </div>
        </nav>

        {/* Logged-in user footer */}
        {user && (
          <div className="px-4 py-4 border-t border-slate-800">
            <p className="text-xs font-medium text-slate-300 truncate">{user.name}</p>
            <p className="text-xs text-slate-500 truncate mb-2">{user.email}</p>
            <button
              onClick={handleLogout}
              className="text-xs text-slate-400 hover:text-white transition-colors"
            >
              Sign out
            </button>
          </div>
        )}
      </aside>

      {/* Page content */}
      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/"           element={<Dashboard />}  />
          <Route path="/pipeline"   element={<Pipeline />}   />
          <Route path="/board"      element={<Board />}      />
          <Route path="/candidates" element={<Candidates />} />
          <Route path="/reqs"       element={<Reqs />}       />
          <Route path="/stats"       element={<Stats />}          />
          <Route path="/pokedex"     element={<Pokedex />}        />
          <Route path="/scheduling"  element={<SchedulingTool />} />
          <Route path="/settings"    element={<Settings />}       />
          <Route path="*"           element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

/* ── Guard: redirect to /login when auth is required ─────────── */
function RequireAuth({ children }) {
  const { user, requiresAuth } = useAuth();

  // Still loading — render nothing to avoid a flash
  if (user === undefined) return null;

  // No users in DB yet → open access (first-run mode)
  if (!requiresAuth) return children;

  // Auth required but not logged in → send to login
  if (!user) return <Navigate to="/login" replace />;

  return children;
}

/* ── Root ────────────────────────────────────────────────────── */
export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public routes */}
        <Route path="/login"    element={<Login />} />
        <Route path="/hm/login"       element={<HMLogin onAuthenticated={() => { window.location.href = '/hm'; }} />} />
        <Route path="/hm"             element={<HMView />} />
        <Route path="/schedule/:token" element={<Schedule />} />
        <Route path="/jobs/:token"     element={<JobPosting />} />

        {/* Everything else is protected */}
        <Route
          path="/*"
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        />
      </Routes>
    </AuthProvider>
  );
}
