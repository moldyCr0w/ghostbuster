import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

const COLORS = [
  '#6B7280', '#3B82F6', '#8B5CF6', '#F59E0B',
  '#10B981', '#EF4444', '#EC4899', '#14B8A6',
  '#F97316', '#6366F1', '#84CC16', '#06B6D4',
];

const VALID_LEVELS   = ['junior', 'mid', 'senior', 'staff', 'principal'];
const TAG_CATEGORIES = ['language', 'framework', 'domain', 'other'];
const LEVEL_COLORS   = {
  junior:    'bg-sky-100 text-sky-700',
  mid:       'bg-blue-100 text-blue-700',
  senior:    'bg-indigo-100 text-indigo-700',
  staff:     'bg-purple-100 text-purple-700',
  principal: 'bg-fuchsia-100 text-fuchsia-700',
};

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
  const [searchParams, setSearchParams] = useSearchParams();

  // ── Google Calendar state ─────────────────────────────────────
  const [gcal, setGcal]           = useState({ connected: false, email: null });
  const [gcalLoading, setGcalLoading] = useState(false);
  const [gcalBanner, setGcalBanner]   = useState(null); // 'connected' | 'error' | null

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
  const [editingHmId, setEditingHmId] = useState(null);
  const [editHmForm, setEditHmForm]   = useState({ name: '', email: '' });
  const [editHmError, setEditHmError] = useState('');

  // ── Panelist tags state ────────────────────────────────────
  const [panelistTags, setPanelistTags]   = useState([]);
  const [tagForm, setTagForm]             = useState({ name: '', category: 'other', color: COLORS[0] });
  const [tagError, setTagError]           = useState('');
  const [editTagId, setEditTagId]         = useState(null);
  const [editTagForm, setEditTagForm]     = useState({ name: '', category: 'other', color: COLORS[0] });

  // ── Panelists state ───────────────────────────────────────
  const [panelists, setPanelists]           = useState([]);
  const [panelistForm, setPanelistForm]     = useState({ name: '', email: '', title: '', qualifications: [], interview_levels: [] });
  const [panelistError, setPanelistError]   = useState('');
  const [editPanelistId, setEditPanelistId] = useState(null); // null = add mode, id = edit mode

  const load = useCallback(async () => {
    const [s, u, hm, gcalStatus, tags, panelsList] = await Promise.all([
      api.getStages(), api.getUsers(), api.getHmUsers(), api.googleAuthStatus(),
      api.getPanelistTags(), api.getPanelists(),
    ]);
    setStages(Array.isArray(s) ? s : []);
    setUsers(Array.isArray(u) ? u : []);
    setHmUsers(Array.isArray(hm) ? hm : []);
    setGcal({ connected: gcalStatus?.connected ?? false, email: gcalStatus?.email ?? null });
    setPanelistTags(Array.isArray(tags) ? tags : []);
    setPanelists(Array.isArray(panelsList) ? panelsList : []);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Read ?gcal= query param set by the OAuth callback redirect.
  useEffect(() => {
    const gcalParam = searchParams.get('gcal');
    if (gcalParam === 'connected' || gcalParam === 'error') {
      setGcalBanner(gcalParam);
      setSearchParams({}, { replace: true }); // clean up URL
      load(); // refresh status
    }
  }, [searchParams, setSearchParams, load]);

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

  const startEditHmUser = (u) => {
    setEditingHmId(u.id);
    setEditHmForm({ name: u.name, email: u.email });
    setEditHmError('');
  };

  const handleUpdateHmUser = async (e) => {
    e.preventDefault();
    setEditHmError('');
    const res = await api.updateHmUser(editingHmId, editHmForm);
    if (res.error) { setEditHmError(res.error); return; }
    setEditingHmId(null);
    load();
  };

  // ── Google Calendar handlers ──────────────────────────────────
  const handleGcalConnect = async () => {
    setGcalLoading(true);
    const { url, error } = await api.googleAuthUrl();
    if (error) { setGcalBanner('error'); setGcalLoading(false); return; }
    window.location.href = url; // full redirect to Google consent screen
  };

  const handleGcalDisconnect = async () => {
    setGcalLoading(true);
    await api.googleAuthDisconnect();
    setGcal({ connected: false, email: null });
    setGcalLoading(false);
  };

  // ── Panelist tag handlers ─────────────────────────────────
  const handleAddTag = async (e) => {
    e.preventDefault();
    setTagError('');
    if (!tagForm.name.trim()) return;
    const res = await api.createPanelistTag(tagForm);
    if (res.error) { setTagError(res.error); return; }
    setTagForm({ name: '', category: 'other', color: COLORS[0] });
    load();
  };

  const startEditTag = (tag) => {
    setEditTagId(tag.id);
    setEditTagForm({ name: tag.name, category: tag.category, color: tag.color });
  };

  const saveTag = async (tag) => {
    const res = await api.updatePanelistTag(tag.id, editTagForm);
    if (res.error) { setTagError(res.error); return; }
    setEditTagId(null);
    load();
  };

  const handleDeleteTag = async (tag) => {
    await api.deletePanelistTag(tag.id);
    load();
  };

  // ── Panelist handlers ─────────────────────────────────────
  const toggleQual = (tagId) => {
    setPanelistForm(f => ({
      ...f,
      qualifications: f.qualifications.includes(tagId)
        ? f.qualifications.filter(id => id !== tagId)
        : [...f.qualifications, tagId],
    }));
  };

  const toggleLevel = (level) => {
    setPanelistForm(f => ({
      ...f,
      interview_levels: f.interview_levels.includes(level)
        ? f.interview_levels.filter(l => l !== level)
        : [...f.interview_levels, level],
    }));
  };

  const handleAddPanelist = async (e) => {
    e.preventDefault();
    setPanelistError('');
    const res = await api.createPanelist(panelistForm);
    if (res.error) { setPanelistError(res.error); return; }
    setPanelistForm({ name: '', email: '', title: '', qualifications: [], interview_levels: [] });
    load();
  };

  const startEditPanelist = (p) => {
    setEditPanelistId(p.id);
    setPanelistForm({
      name:            p.name,
      email:           p.email,
      title:           p.title || '',
      qualifications:  p.qualifications.map(t => t.id), // server returns full tag objects
      interview_levels: p.interview_levels,
    });
  };

  const savePanelist = async (e) => {
    e.preventDefault();
    setPanelistError('');
    const res = await api.updatePanelist(editPanelistId, panelistForm);
    if (res.error) { setPanelistError(res.error); return; }
    setEditPanelistId(null);
    setPanelistForm({ name: '', email: '', title: '', qualifications: [], interview_levels: [] });
    load();
  };

  const cancelEditPanelist = () => {
    setEditPanelistId(null);
    setPanelistForm({ name: '', email: '', title: '', qualifications: [], interview_levels: [] });
    setPanelistError('');
  };

  const handleDeletePanelist = async (p) => {
    await api.deletePanelist(p.id);
    if (editPanelistId === p.id) cancelEditPanelist();
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
                <li key={u.id} className="px-4 py-3">
                  {editingHmId === u.id ? (
                    <form onSubmit={handleUpdateHmUser} className="flex flex-wrap gap-2 items-center">
                      <input
                        required
                        value={editHmForm.name}
                        onChange={e => setEditHmForm(f => ({ ...f, name: e.target.value }))}
                        className="w-36 border border-slate-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <input
                        required
                        type="email"
                        value={editHmForm.email}
                        onChange={e => setEditHmForm(f => ({ ...f, email: e.target.value }))}
                        className="flex-1 min-w-40 border border-slate-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      {editHmError && <span className="w-full text-xs text-red-500">{editHmError}</span>}
                      <button type="submit" className="px-2.5 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save</button>
                      <button type="button" onClick={() => setEditingHmId(null)} className="px-2.5 py-1 text-xs bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200">Cancel</button>
                    </form>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-slate-800">{u.name}</span>
                        <p className="text-xs text-slate-400 mt-0.5">{u.email}</p>
                      </div>
                      <button
                        onClick={() => startEditHmUser(u)}
                        className="px-2.5 py-1 text-xs bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteHmUser(u)}
                        className="px-2.5 py-1 text-xs bg-red-50 text-red-500 rounded-lg hover:bg-red-100"
                      >
                        Remove
                      </button>
                    </div>
                  )}
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

      {/* ── Interview Qualification Tags ─────────────────────── */}
      <div className="mt-10">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-slate-800">Interview Qualification Tags</h2>
          <p className="text-slate-400 text-sm mt-0.5">
            Define the skill and domain tags used to qualify panelists for interviews.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-5">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Tags</p>
            <p className="text-xs text-slate-400">{panelistTags.length} total</p>
          </div>
          {panelistTags.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-sm">No tags yet — add one below.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {panelistTags.map(tag => (
                <li key={tag.id} className="px-4 py-3 flex items-center gap-3 min-w-0">
                  {editTagId === tag.id ? (
                    <>
                      <ColorDot color={editTagForm.color} />
                      <input
                        autoFocus
                        value={editTagForm.name}
                        onChange={e => setEditTagForm(f => ({ ...f, name: e.target.value }))}
                        className="flex-1 min-w-0 border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <select
                        value={editTagForm.category}
                        onChange={e => setEditTagForm(f => ({ ...f, category: e.target.value }))}
                        className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none"
                      >
                        {TAG_CATEGORIES.map(c => (
                          <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                        ))}
                      </select>
                      <ColorPicker value={editTagForm.color} onChange={c => setEditTagForm(f => ({ ...f, color: c }))} />
                      <button onClick={() => saveTag(tag)} className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700">Save</button>
                      <button onClick={() => setEditTagId(null)} className="px-3 py-1.5 bg-slate-100 text-slate-600 text-xs rounded-lg hover:bg-slate-200">Cancel</button>
                    </>
                  ) : (
                    <>
                      <ColorDot color={tag.color} />
                      <span className="flex-1 text-sm text-slate-800 font-medium">{tag.name}</span>
                      <span className="px-2 py-0.5 text-xs rounded-full bg-slate-100 text-slate-500">{tag.category}</span>
                      <button onClick={() => startEditTag(tag)} className="px-2.5 py-1 text-xs bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200">Edit</button>
                      <button onClick={() => handleDeleteTag(tag)} className="px-2.5 py-1 text-xs bg-red-50 text-red-500 rounded-lg hover:bg-red-100">Delete</button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {tagError && (
          <p className="text-red-600 text-sm mb-4 bg-red-50 border border-red-100 rounded-lg px-4 py-2">{tagError}</p>
        )}

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Add Tag</h3>
          <form onSubmit={handleAddTag} className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-32">
              <label className="block text-xs text-slate-500 mb-1">Tag Name *</label>
              <input
                required
                value={tagForm.name}
                onChange={e => setTagForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. TypeScript"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Category</label>
              <select
                value={tagForm.category}
                onChange={e => setTagForm(f => ({ ...f, category: e.target.value }))}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {TAG_CATEGORIES.map(c => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Color</label>
              <ColorPicker value={tagForm.color} onChange={c => setTagForm(f => ({ ...f, color: c }))} />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Add Tag
            </button>
          </form>
        </div>
      </div>

      {/* ── Panelists ─────────────────────────────────────────── */}
      <div className="mt-10">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-slate-800">Panelists</h2>
          <p className="text-slate-400 text-sm mt-0.5">
            Maintain your interview panel roster with skills and the candidate levels they can interview.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-5">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Panelists</p>
            <p className="text-xs text-slate-400">{panelists.length} total</p>
          </div>
          {panelists.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-sm">No panelists yet — add one below.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {panelists.map(p => (
                <li key={p.id} className={`px-4 py-3 flex items-start gap-3 ${editPanelistId === p.id ? 'bg-blue-50' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-slate-800">{p.name}</span>
                      {p.title && <span className="text-xs text-slate-400">{p.title}</span>}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{p.email}</p>
                    {/* Level badges */}
                    {p.interview_levels.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {p.interview_levels.map(lvl => (
                          <span key={lvl} className={`px-2 py-0.5 text-xs rounded-full font-medium ${LEVEL_COLORS[lvl] || 'bg-slate-100 text-slate-600'}`}>
                            {lvl.charAt(0).toUpperCase() + lvl.slice(1)}
                          </span>
                        ))}
                      </div>
                    )}
                    {/* Qualification tag chips */}
                    {p.qualifications.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {p.qualifications.map(tag => (
                          <span
                            key={tag.id}
                            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full text-white"
                            style={{ backgroundColor: tag.color }}
                          >
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                    <button
                      onClick={() => editPanelistId === p.id ? cancelEditPanelist() : startEditPanelist(p)}
                      className={`px-2.5 py-1 text-xs rounded-lg ${editPanelistId === p.id ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                      {editPanelistId === p.id ? 'Cancel' : 'Edit'}
                    </button>
                    <button
                      onClick={() => handleDeletePanelist(p)}
                      className="px-2.5 py-1 text-xs bg-red-50 text-red-500 rounded-lg hover:bg-red-100"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {panelistError && (
          <p className="text-red-600 text-sm mb-4 bg-red-50 border border-red-100 rounded-lg px-4 py-2">{panelistError}</p>
        )}

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">
            {editPanelistId ? 'Edit Panelist' : 'Add Panelist'}
          </h3>
          <form onSubmit={editPanelistId ? savePanelist : handleAddPanelist} className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <div className="flex-1 min-w-32">
                <label className="block text-xs text-slate-500 mb-1">Full Name *</label>
                <input
                  required
                  value={panelistForm.name}
                  onChange={e => setPanelistForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Alex Johnson"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex-1 min-w-40">
                <label className="block text-xs text-slate-500 mb-1">Work Email *</label>
                <input
                  required
                  type="email"
                  value={panelistForm.email}
                  onChange={e => setPanelistForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="alex@company.com"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex-1 min-w-32">
                <label className="block text-xs text-slate-500 mb-1">Title</label>
                <input
                  value={panelistForm.title}
                  onChange={e => setPanelistForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Senior Engineer"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Can interview levels */}
            <div>
              <label className="block text-xs text-slate-500 mb-2">Can interview (levels)</label>
              <div className="flex flex-wrap gap-2">
                {VALID_LEVELS.map(lvl => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => toggleLevel(lvl)}
                    className={`px-3 py-1 text-xs rounded-full font-medium border transition-colors ${
                      panelistForm.interview_levels.includes(lvl)
                        ? LEVEL_COLORS[lvl] + ' border-transparent'
                        : 'bg-white text-slate-500 border-slate-300 hover:border-slate-400'
                    }`}
                  >
                    {lvl.charAt(0).toUpperCase() + lvl.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Qualification tags */}
            {panelistTags.length > 0 && (
              <div>
                <label className="block text-xs text-slate-500 mb-2">Qualifications</label>
                <div className="flex flex-wrap gap-2">
                  {panelistTags.map(tag => {
                    const selected = panelistForm.qualifications.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => toggleQual(tag.id)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs rounded-full border transition-colors ${
                          selected
                            ? 'text-white border-transparent'
                            : 'bg-white text-slate-500 border-slate-300 hover:border-slate-400'
                        }`}
                        style={selected ? { backgroundColor: tag.color, borderColor: 'transparent' } : {}}
                      >
                        {!selected && <ColorDot color={tag.color} size="w-2 h-2" />}
                        {tag.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                {editPanelistId ? 'Save Changes' : 'Add Panelist'}
              </button>
              {editPanelistId && (
                <button
                  type="button"
                  onClick={cancelEditPanelist}
                  className="px-4 py-2 bg-slate-100 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* ── Google Calendar ───────────────────────────────────── */}
      <div className="mt-10 mb-10">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-slate-800">Google Calendar</h2>
          <p className="text-slate-400 text-sm mt-0.5">
            Connect your Google account to enable candidate self-scheduling. GhostBuster
            will use your calendar visibility to check panelist availability and create
            interview invites.
          </p>
        </div>

        {/* Banner: success or error from OAuth redirect */}
        {gcalBanner === 'connected' && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-xl flex items-center justify-between">
            <p className="text-sm text-green-800 font-medium">Google Calendar connected successfully.</p>
            <button onClick={() => setGcalBanner(null)} className="text-xs text-green-700 underline">Dismiss</button>
          </div>
        )}
        {gcalBanner === 'error' && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between">
            <p className="text-sm text-red-700 font-medium">Google authorization failed. Please try again.</p>
            <button onClick={() => setGcalBanner(null)} className="text-xs text-red-600 underline">Dismiss</button>
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          {gcal.connected ? (
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {/* Google "G" logo */}
                <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">Connected</p>
                  <p className="text-xs text-slate-400">{gcal.email}</p>
                </div>
              </div>
              <button
                onClick={handleGcalDisconnect}
                disabled={gcalLoading}
                className="px-3 py-1.5 text-xs bg-red-50 text-red-500 rounded-lg hover:bg-red-100 disabled:opacity-50"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-slate-600">No Google account connected.</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  You'll need <code className="bg-slate-100 px-1 rounded">GOOGLE_CLIENT_ID</code> and{' '}
                  <code className="bg-slate-100 px-1 rounded">GOOGLE_CLIENT_SECRET</code> set in your environment.
                </p>
              </div>
              <button
                onClick={handleGcalConnect}
                disabled={gcalLoading}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors shadow-sm"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Connect Google Calendar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
