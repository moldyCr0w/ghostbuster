import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

const COLORS = [
  '#6B7280', '#3B82F6', '#8B5CF6', '#F59E0B',
  '#10B981', '#EF4444', '#EC4899', '#14B8A6',
  '#F97316', '#6366F1', '#84CC16', '#06B6D4',
];

function ColorDot({ color, size = 'w-4 h-4' }) {
  return <div className={`${size} rounded-full flex-shrink-0`} style={{ backgroundColor: color }} />;
}

function ColorPicker({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1" style={{ maxWidth: 130 }}>
      {COLORS.map(c => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`w-5 h-5 rounded-full transition-transform hover:scale-110 ${
            value === c ? 'ring-2 ring-offset-1 ring-slate-500 scale-110' : ''
          }`}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}

export default function Settings() {
  const { user: me } = useAuth();

  // ── Stages state ────────────────────────────────────────────
  const [stages, setStages]       = useState([]);
  const [newName, setNewName]     = useState('');
  const [newColor, setNewColor]   = useState(COLORS[0]);
  const [newTerm, setNewTerm]     = useState(false);
  const [newHire, setNewHire]     = useState(false);
  const [editId, setEditId]       = useState(null);
  const [editName, setEditName]   = useState('');
  const [editColor, setEditColor] = useState('');
  const [editTerm, setEditTerm]   = useState(false);
  const [editHire, setEditHire]   = useState(false);
  const [error, setError]         = useState('');

  // ── Users state ─────────────────────────────────────────────
  const [users, setUsers]           = useState([]);
  const [userForm, setUserForm]     = useState({ name: '', email: '', role: 'recruiter' });
  const [userError, setUserError]   = useState('');
  const [pinInfo, setPinInfo]       = useState(null); // { name, pin } for display after creation

  // ── HM Users state ───────────────────────────────────────────
  const [hmUsers, setHmUsers]         = useState([]);
  const [hmUserForm, setHmUserForm]   = useState({ name: '', email: '' });
  const [hmUserError, setHmUserError] = useState('');
  const [hmPinInfo, setHmPinInfo]     = useState(null); // { name, pin, email } after adding HM

  const load = useCallback(async () => {
    const [s, u, hm] = await Promise.all([api.getStages(), api.getUsers(), api.getHmUsers()]);
    setStages(s);
    setUsers(u);
    setHmUsers(hm);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setError('');
    await api.createStage({ name: newName.trim(), color: newColor, is_terminal: newTerm || newHire, is_hire: newHire });
    setNewName('');
    setNewColor(COLORS[0]);
    setNewTerm(false);
    setNewHire(false);
    load();
  };

  const handleDelete = async (stage) => {
    setError('');
    const res = await api.deleteStage(stage.id);
    if (res.error) setError(res.error);
    else load();
  };

  const startEdit = (stage) => {
    setEditId(stage.id);
    setEditName(stage.name);
    setEditColor(stage.color);
    setEditTerm(!!stage.is_terminal);
    setEditHire(!!stage.is_hire);
  };

  const saveEdit = async (stage) => {
    await api.updateStage(stage.id, {
      name:        editName,
      color:       editColor,
      order_index: stage.order_index,
      is_terminal: editTerm || editHire,  // hire stages are always terminal
      is_hire:     editHire,
    });
    setEditId(null);
    load();
  };

  // ── User handlers ────────────────────────────────────────────
  const handleAddUser = async (e) => {
    e.preventDefault();
    setUserError('');
    setPinInfo(null);
    const res = await api.createUser(userForm);
    if (res.error) { setUserError(res.error); return; }
    // Generate a PIN for the new user immediately so admin can share it
    const pinRes = await fetch('/api/auth/request', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email: userForm.email }),
    }).then(r => r.json());
    if (pinRes.pin) setPinInfo({ name: userForm.name, pin: pinRes.pin, email: userForm.email });
    setUserForm({ name: '', email: '', role: 'recruiter' });
    load();
  };

  const handleDeleteUser = async (u) => {
    await api.deleteUser(u.id);
    load();
  };

  // ── HM User handlers ─────────────────────────────────────────
  const handleAddHmUser = async (e) => {
    e.preventDefault();
    setHmUserError('');
    setHmPinInfo(null);
    const res = await api.createHmUser(hmUserForm);
    if (res.error) { setHmUserError(res.error); return; }
    // Generate a first-login PIN immediately so admin can share it
    const pinRes = await fetch('/api/auth/hm-request', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email: hmUserForm.email }),
    }).then(r => r.json());
    if (pinRes.pin) setHmPinInfo({ name: hmUserForm.name, pin: pinRes.pin, email: hmUserForm.email });
    setHmUserForm({ name: '', email: '' });
    load();
  };

  const handleDeleteHmUser = async (u) => {
    await api.deleteHmUser(u.id);
    load();
  };

  const move = async (stage, dir) => {
    const idx  = stages.findIndex(s => s.id === stage.id);
    const swap = stages[dir === 'up' ? idx - 1 : idx + 1];
    if (!swap) return;
    await Promise.all([
      api.updateStage(stage.id, { name: stage.name, color: stage.color, order_index: swap.order_index,  is_terminal: stage.is_terminal, is_hire: stage.is_hire }),
      api.updateStage(swap.id,  { name: swap.name,  color: swap.color,  order_index: stage.order_index, is_terminal: swap.is_terminal,  is_hire: swap.is_hire }),
    ]);
    load();
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Settings</h1>
        <p className="text-slate-400 text-sm mt-0.5">Manage your hiring funnel stages</p>
      </div>

      {/* Stages list */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-5">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
          <p className="text-sm font-semibold text-slate-700">Funnel Stages</p>
          <p className="text-xs text-slate-400 mt-0.5">
            Stages marked as <strong>Terminal</strong> won't appear in dashboard reminders.
          </p>
        </div>

        {stages.length === 0 ? (
          <div className="py-10 text-center text-slate-400 text-sm">No stages yet.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {stages.map((stage, idx) => (
              <li key={stage.id} className="px-4 py-3 flex items-center gap-3">
                {editId === stage.id ? (
                  /* ── edit row ── */
                  <>
                    <ColorDot color={editColor} />
                    <input
                      autoFocus
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <ColorPicker value={editColor} onChange={setEditColor} />
                    <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={editTerm}
                        onChange={e => setEditTerm(e.target.checked)}
                        className="rounded"
                        disabled={editHire}
                      />
                      Terminal
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-green-700 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={editHire}
                        onChange={e => { setEditHire(e.target.checked); if (e.target.checked) setEditTerm(true); }}
                        className="rounded"
                      />
                      Hire
                    </label>
                    <button onClick={() => saveEdit(stage)} className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700">Save</button>
                    <button onClick={() => setEditId(null)} className="px-3 py-1.5 bg-slate-100 text-slate-600 text-xs rounded-lg hover:bg-slate-200">Cancel</button>
                  </>
                ) : (
                  /* ── display row ── */
                  <>
                    <ColorDot color={stage.color} />
                    <span className="flex-1 text-sm text-slate-800 font-medium">{stage.name}</span>
                    {stage.is_hire ? (
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-medium">Hire</span>
                    ) : stage.is_terminal ? (
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-xs rounded-full">Terminal</span>
                    ) : null}
                    <div className="flex items-center gap-1 ml-2">
                      <button disabled={idx === 0}              onClick={() => move(stage, 'up')}   className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-25 text-base leading-none">↑</button>
                      <button disabled={idx === stages.length - 1} onClick={() => move(stage, 'down')} className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-25 text-base leading-none">↓</button>
                      <button onClick={() => startEdit(stage)} className="px-2.5 py-1 text-xs bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 ml-1">Edit</button>
                      <button onClick={() => handleDelete(stage)} className="px-2.5 py-1 text-xs bg-red-50 text-red-500 rounded-lg hover:bg-red-100">Delete</button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && (
        <p className="text-red-600 text-sm mb-4 bg-red-50 border border-red-100 rounded-lg px-4 py-2">{error}</p>
      )}

      {/* Add new stage */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Add New Stage</h3>
        <form onSubmit={handleAdd} className="space-y-3">
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-xs text-slate-500 mb-1">Stage Name</label>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Background Check"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Color</label>
              <ColorPicker value={newColor} onChange={setNewColor} />
            </div>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={newTerm}
                  onChange={e => setNewTerm(e.target.checked)}
                  className="rounded"
                  disabled={newHire}
                />
                Terminal
              </label>
              <label className="flex items-center gap-2 text-sm text-green-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={newHire}
                  onChange={e => { setNewHire(e.target.checked); if (e.target.checked) setNewTerm(true); }}
                  className="rounded"
                />
                Hire stage
              </label>
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Add Stage
            </button>
          </div>
        </form>
      </div>

      {/* ── Users ─────────────────────────────────────────────── */}
      <div className="mt-10">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-slate-800">Team Access</h2>
          <p className="text-slate-400 text-sm mt-0.5">
            Add recruiters so they can sign in with a magic PIN.
          </p>
        </div>

        {/* PIN callout — shown after creating a user */}
        {pinInfo && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-xl">
            <p className="text-sm font-semibold text-green-800 mb-1">
              ✓ {pinInfo.name} was added — here's their first sign-in PIN
            </p>
            <p className="text-3xl font-mono font-bold tracking-widest text-green-700 mb-1">
              {pinInfo.pin}
            </p>
            <p className="text-xs text-green-600">
              Share this with {pinInfo.name} ({pinInfo.email}) — it expires in 10 minutes.
              They can request a new PIN from the login page any time.
            </p>
            <button
              onClick={() => setPinInfo(null)}
              className="mt-2 text-xs text-green-700 underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Users list */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-5">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Users</p>
            <p className="text-xs text-slate-400">{users.length} total</p>
          </div>
          {users.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-sm">
              No users yet — the app is currently open to anyone on the network.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {users.map(u => (
                <li key={u.id} className="px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-800">{u.name}</span>
                      <span className={`px-1.5 py-0.5 text-xs rounded-full font-medium ${
                        u.role === 'admin'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {u.role}
                      </span>
                      {me?.email === u.email && (
                        <span className="text-xs text-slate-400">(you)</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{u.email}</p>
                  </div>
                  {me?.email !== u.email && (
                    <button
                      onClick={() => handleDeleteUser(u)}
                      className="px-2.5 py-1 text-xs bg-red-50 text-red-500 rounded-lg hover:bg-red-100"
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {userError && (
          <p className="text-red-600 text-sm mb-4 bg-red-50 border border-red-100 rounded-lg px-4 py-2">
            {userError}
          </p>
        )}

        {/* Add user form */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Add User</h3>
          <form onSubmit={handleAddUser} className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Full Name *</label>
              <input
                required
                value={userForm.name}
                onChange={e => setUserForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Jane Smith"
                className="w-36 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex-1 min-w-48">
              <label className="block text-xs text-slate-500 mb-1">Email *</label>
              <input
                required
                type="email"
                value={userForm.email}
                onChange={e => setUserForm(f => ({ ...f, email: e.target.value }))}
                placeholder="jane@company.com"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Role</label>
              <select
                value={userForm.role}
                onChange={e => setUserForm(f => ({ ...f, role: e.target.value }))}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="recruiter">Recruiter</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Add User
            </button>
          </form>
        </div>
      </div>

      {/* ── Hiring Managers ──────────────────────────────────── */}
      <div className="mt-10">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-slate-800">Hiring Manager Accounts</h2>
          <p className="text-slate-400 text-sm mt-0.5">
            Each HM gets their own account. They sign in at{' '}
            <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">/hm/login</code> with their email
            and a one-time PIN you generate for them.
          </p>
        </div>

        {/* PIN callout — shown after adding an HM */}
        {hmPinInfo && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-xl">
            <p className="text-sm font-semibold text-green-800 mb-1">
              ✓ {hmPinInfo.name} was added — here's their first sign-in PIN
            </p>
            <p className="text-3xl font-mono font-bold tracking-widest text-green-700 mb-1">
              {hmPinInfo.pin}
            </p>
            <p className="text-xs text-green-600">
              Share this with {hmPinInfo.name} ({hmPinInfo.email}) — it expires in 10 minutes.
              They can request a new PIN from the login page any time.
            </p>
            <button
              onClick={() => setHmPinInfo(null)}
              className="mt-2 text-xs text-green-700 underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* HM Users list */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-5">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Hiring Managers</p>
            <p className="text-xs text-slate-400">{hmUsers.length} total</p>
          </div>
          {hmUsers.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-sm">
              No HMs yet — add one below to enable portal access.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {hmUsers.map(u => (
                <li key={u.id} className="px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-slate-800">{u.name}</span>
                    <p className="text-xs text-slate-400 mt-0.5">{u.email}</p>
                  </div>
                  <button
                    onClick={() => handleDeleteHmUser(u)}
                    className="px-2.5 py-1 text-xs bg-red-50 text-red-500 rounded-lg hover:bg-red-100"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {hmUserError && (
          <p className="text-red-600 text-sm mb-4 bg-red-50 border border-red-100 rounded-lg px-4 py-2">
            {hmUserError}
          </p>
        )}

        {/* Add HM form */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Add Hiring Manager</h3>
          <form onSubmit={handleAddHmUser} className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Full Name *</label>
              <input
                required
                value={hmUserForm.name}
                onChange={e => setHmUserForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Alex Johnson"
                className="w-36 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex-1 min-w-48">
              <label className="block text-xs text-slate-500 mb-1">Work Email *</label>
              <input
                required
                type="email"
                value={hmUserForm.email}
                onChange={e => setHmUserForm(f => ({ ...f, email: e.target.value }))}
                placeholder="alex@company.com"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Add HM
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
