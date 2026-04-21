import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

const STATUS_STYLES = {
  open:     'bg-green-100 text-green-700 border border-green-200',
  on_hold:  'bg-amber-100 text-amber-700 border border-amber-200',
  closed:   'bg-slate-100 text-slate-500 border border-slate-200',
};
const STATUS_LABELS = { open: 'Open', on_hold: 'On Hold', closed: 'Closed' };

const PRIORITY_CFG = {
  critical: { label: 'P1 · Critical', badge: 'bg-red-100 text-red-700 border-red-200'    },
  high:     { label: 'P2 · High',     badge: 'bg-orange-100 text-orange-700 border-orange-200' },
  medium:   { label: 'P3 · Medium',   badge: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  low:      { label: 'P4 · Low',      badge: 'bg-slate-100 text-slate-500 border-slate-200'    },
};

const EMPTY_FORM = { title: '', department: '', status: 'open', priority: 'medium', hiring_manager: '', recruiter: '', script_doc_url: '', job_description: '', is_public: false, plan_id: '', initial_slot: '' };

const WD_SLOT_STATUS_STYLES = {
  open:   'bg-emerald-50 text-emerald-700 border border-emerald-200',
  pushed: 'bg-amber-50 text-amber-700 border border-amber-200',
  filled: 'bg-slate-100 text-slate-500 border border-slate-200',
};

const ROLE_RANK = { recruiter: 1, senior_recruiter: 2, admin: 3 };

export default function Reqs() {
  const { user } = useAuth() || {};
  const canManageSlots = user?.role === 'senior_recruiter' || user?.role === 'admin';
  const canEdit        = ROLE_RANK[user?.role] >= ROLE_RANK.senior_recruiter;
  const [reqs, setReqs]         = useState([]);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [editId, setEditId]     = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(true);
  const [users, setUsers]       = useState([]);   // recruiters (also sourcers)
  const [hmUsers, setHmUsers]   = useState([]);   // hiring managers
  const [copied, setCopied]     = useState(null); // req id that was just copied

  // WD slots state: { [reqId]: { slots: [], expanded: bool, newReqId: '', newLabel: '', adding: bool, err: '' } }
  const [wdSlotState, setWdSlotState] = useState({});

  const [plans, setPlans]       = useState([]);   // interview plans
  const [recruiterFilter, setRecruiterFilter] = useState('all');

  const load = useCallback(async () => {
    setReqs(await api.getReqs());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Load user lists and plans for dropdowns
  useEffect(() => {
    api.getUsers().then(d => setUsers(Array.isArray(d) ? d : [])).catch(() => {});
    api.getHmUsers().then(d => setHmUsers(Array.isArray(d) ? d : [])).catch(() => {});
    api.getInterviewPlans().then(d => setPlans(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const set    = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));
  const setEdit= (field) => (e) => setEditForm(f => ({ ...f, [field]: e.target.value }));

  // ── WD slot helpers ──────────────────────────────────────────────────────

  const wdState = (reqId) => wdSlotState[reqId] || { slots: [], expanded: false, newWdReqId: '', newLabel: '', adding: false, err: '' };
  const setWd   = (reqId, patch) => setWdSlotState(s => ({ ...s, [reqId]: { ...wdState(reqId), ...patch } }));

  const toggleWdSlots = async (req) => {
    const cur = wdState(req.id);
    if (!cur.expanded) {
      // Load slots on first open
      const slots = await api.getWdSlots(req.id).catch(() => []);
      setWd(req.id, { expanded: true, slots });
    } else {
      setWd(req.id, { expanded: false });
    }
  };

  const handleAddSlot = async (req) => {
    const cur = wdState(req.id);
    if (!cur.newWdReqId.trim()) return;
    setWd(req.id, { adding: true, err: '' });
    const res = await api.addWdSlot(req.id, { wd_req_id: cur.newWdReqId.trim(), label: cur.newLabel.trim() || undefined });
    if (res.error) { setWd(req.id, { adding: false, err: res.error }); return; }
    const slots = await api.getWdSlots(req.id).catch(() => []);
    setWd(req.id, { adding: false, slots, newWdReqId: '', newLabel: '' });
  };

  const handleDeleteSlot = async (req, slotId) => {
    const res = await api.deleteWdSlot(req.id, slotId);
    if (res.error) { setWd(req.id, { err: res.error }); return; }
    const slots = await api.getWdSlots(req.id).catch(() => []);
    setWd(req.id, { slots });
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    setError('');
    const res = await api.createReq(form);
    if (res.error) { setError(res.error); return; }
    // Auto-create the required first slot
    if (form.initial_slot.trim()) {
      await api.addWdSlot(res.id, { wd_req_id: form.initial_slot.trim() });
    }
    setForm(EMPTY_FORM);
    load();
  };

  const handleDelete = async (req) => {
    setError('');
    const res = await api.deleteReq(req.id);
    if (res.error) { setError(res.error); return; }
    load();
  };

  const startEdit = (r) => {
    setEditId(r.id);
    // req_id kept in editForm (hidden) so the PUT can preserve the internal key
    setEditForm({ req_id: r.req_id, title: r.title, department: r.department || '', status: r.status, priority: r.priority || 'medium', hiring_manager: r.hiring_manager || '', recruiter: r.recruiter || '', script_doc_url: r.script_doc_url || '', job_description: r.job_description || '', is_public: !!r.is_public, plan_id: r.plan_id || '' });
  };

  const copyLink = (r) => {
    const url = `${window.location.origin}/jobs/${r.public_token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(r.id);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const saveEdit = async (r) => {
    setError('');
    const res = await api.updateReq(r.id, { ...editForm, is_public: editForm.is_public ? 1 : 0 });
    if (res.error) { setError(res.error); return; }
    // Persist the returned public_token back into local state immediately.
    if (res.public_token) {
      setReqs(prev => prev.map(x => x.id === r.id ? { ...x, public_token: res.public_token, is_public: editForm.is_public ? 1 : 0 } : x));
    }
    setEditId(null);
    load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-slate-400 text-sm">Loading…</span>
      </div>
    );
  }

  // Derive unique recruiter names from loaded reqs for the filter dropdown
  const uniqueRecruiters = [...new Set(reqs.map(r => r.recruiter).filter(Boolean))].sort();

  const filteredReqs = recruiterFilter === 'all'
    ? reqs
    : reqs.filter(r => r.recruiter === recruiterFilter);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Requisitions</h1>
        <p className="text-slate-400 text-sm mt-0.5">
          Track open roles and link candidates to the reqs they're being considered for
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select
          value={recruiterFilter}
          onChange={e => setRecruiterFilter(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-600"
        >
          <option value="all">All Recruiters / Sourcers</option>
          {uniqueRecruiters.map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        {recruiterFilter !== 'all' && (
          <button
            onClick={() => setRecruiterFilter('all')}
            className="text-xs text-slate-400 hover:text-slate-600"
          >
            Clear filter ✕
          </button>
        )}
      </div>

      {/* Reqs table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-5">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700">All Requisitions</p>
          <p className="text-xs text-slate-400">{filteredReqs.length} total</p>
        </div>

        {filteredReqs.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-sm">
            {reqs.length === 0 ? 'No requisitions yet — add one below.' : 'No requisitions match the selected filter.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">Title</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide whitespace-nowrap">Department</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">Priority</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">Candidates</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">Job Page</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredReqs.map(r => (
                <React.Fragment key={r.id}>
                <tr className="hover:bg-slate-50">
                    {editId === r.id ? (
                      /* ── edit row ── */
                      <td colSpan={5} className="px-4 py-3">
                        <div className="flex flex-wrap gap-2 items-end">
                          <div className="flex-1 min-w-40">
                            <label className="block text-xs text-slate-500 mb-1">Title</label>
                            <input
                              autoFocus
                              value={editForm.title}
                              onChange={setEdit('title')}
                              className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">Department</label>
                            <input
                              value={editForm.department}
                              onChange={setEdit('department')}
                              className="w-36 border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">Hiring Manager</label>
                            <select
                              value={editForm.hiring_manager}
                              onChange={setEdit('hiring_manager')}
                              className="w-44 border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="">— Select —</option>
                              {hmUsers.map(u => (
                                <option key={u.id} value={u.name}>{u.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">Recruiter</label>
                            <select
                              value={editForm.recruiter}
                              onChange={setEdit('recruiter')}
                              className="w-44 border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="">— Select —</option>
                              {users.map(u => (
                                <option key={u.id} value={u.name}>{u.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">Status</label>
                            <select
                              value={editForm.status}
                              onChange={setEdit('status')}
                              className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="open">Open</option>
                              <option value="on_hold">On Hold</option>
                              <option value="closed">Closed</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">Priority</label>
                            <select
                              value={editForm.priority || 'medium'}
                              onChange={setEdit('priority')}
                              className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="critical">P1 · Critical</option>
                              <option value="high">P2 · High</option>
                              <option value="medium">P3 · Medium</option>
                              <option value="low">P4 · Low</option>
                            </select>
                          </div>
                          <div className="flex-1 min-w-48">
                            <label className="block text-xs text-slate-500 mb-1">Scorecard</label>
                            <input
                              value={editForm.script_doc_url}
                              onChange={setEdit('script_doc_url')}
                              placeholder="https://docs.google.com/..."
                              className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div className="w-full">
                            <label className="block text-xs text-slate-500 mb-1">Job Description (shown on public posting page)</label>
                            <textarea
                              value={editForm.job_description}
                              onChange={setEdit('job_description')}
                              rows={6}
                              placeholder="Describe the role, responsibilities, requirements, and what makes this a great opportunity…"
                              className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                            />
                          </div>
                          <div className="flex items-center gap-2 pb-0.5">
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                              <div
                                onClick={() => setEditForm(f => ({ ...f, is_public: !f.is_public }))}
                                className={`relative w-8 h-4 rounded-full transition-colors ${editForm.is_public ? 'bg-violet-600' : 'bg-slate-300'}`}
                              >
                                <span className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${editForm.is_public ? 'translate-x-4' : ''}`} />
                              </div>
                              <span className="text-xs text-slate-600">Make public</span>
                            </label>
                            {editForm.is_public && (
                              <span className="text-xs text-slate-400">(generates a shareable link)</span>
                            )}
                          </div>
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">Interview Plan</label>
                            <select
                              value={editForm.plan_id}
                              onChange={setEdit('plan_id')}
                              className="w-44 border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="">— None —</option>
                              {plans.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                            </select>
                          </div>
                          <div className="flex gap-2 pb-0.5">
                            <button
                              onClick={() => saveEdit(r)}
                              className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditId(null)}
                              className="px-3 py-1.5 bg-slate-100 text-slate-600 text-xs rounded-lg hover:bg-slate-200"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </td>
                    ) : (
                      /* ── display row ── */
                      <>
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-800">{r.title}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{r.department || <span className="text-slate-300">—</span>}</td>
                        <td className="px-4 py-3">
                          {(() => {
                            const p = PRIORITY_CFG[r.priority] || PRIORITY_CFG.medium;
                            return (
                              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${p.badge}`}>
                                {p.label}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[r.status]}`}>
                            {STATUS_LABELS[r.status]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs">
                          {r.candidate_count > 0
                            ? <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full">{r.candidate_count}</span>
                            : <span className="text-slate-300">0</span>
                          }
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {r.is_public && r.public_token ? (
                            <button
                              onClick={() => copyLink(r)}
                              title={`${window.location.origin}/jobs/${r.public_token}`}
                              className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-violet-50 text-violet-700 rounded-lg hover:bg-violet-100 transition-colors"
                            >
                              {copied === r.id ? (
                                <>
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                  Copied
                                </>
                              ) : (
                                <>
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                  Copy Link
                                </>
                              )}
                            </button>
                          ) : (
                            <span className="text-slate-300 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 justify-end">
                            <button
                              onClick={() => toggleWdSlots(r)}
                              className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${wdState(r.id).expanded ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`}
                              title="Workday HC Slots"
                            >
                              WD
                            </button>
                            <button
                              onClick={() => startEdit(r)}
                              className="px-2.5 py-1 text-xs bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(r)}
                              className="px-2.5 py-1 text-xs bg-red-50 text-red-500 rounded-lg hover:bg-red-100"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                  {/* WD HC Slots expansion row */}
                  {wdState(r.id).expanded && (
                    <tr>
                      <td colSpan={7} className="px-4 pb-4 pt-0 bg-emerald-50/40">
                        <div className="border border-emerald-200 rounded-xl overflow-hidden">
                          <div className="px-4 py-2.5 bg-emerald-50 border-b border-emerald-200 flex items-center justify-between">
                            <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wide">Workday HC Slots</p>
                            <p className="text-xs text-emerald-600">{wdState(r.id).slots.length} slot{wdState(r.id).slots.length !== 1 ? 's' : ''}</p>
                          </div>

                          {wdState(r.id).slots.length === 0 ? (
                            <p className="px-4 py-3 text-xs text-slate-400 italic">No HC slots configured yet.</p>
                          ) : (
                            <table className="w-full text-xs">
                              <thead className="border-b border-emerald-100">
                                <tr>
                                  <th className="text-left px-4 py-2 font-medium text-slate-500">WD Req ID</th>
                                  <th className="text-left px-4 py-2 font-medium text-slate-500">Label</th>
                                  <th className="text-left px-4 py-2 font-medium text-slate-500">Status</th>
                                  <th className="text-left px-4 py-2 font-medium text-slate-500">Candidate</th>
                                  <th className="px-4 py-2"></th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-emerald-50">
                                {wdState(r.id).slots.map(slot => (
                                  <tr key={slot.id} className="bg-white">
                                    <td className="px-4 py-2 font-mono font-semibold text-slate-700">{slot.wd_req_id}</td>
                                    <td className="px-4 py-2 text-slate-500">{slot.label || <span className="text-slate-300">—</span>}</td>
                                    <td className="px-4 py-2">
                                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${WD_SLOT_STATUS_STYLES[slot.status]}`}>
                                        {slot.status}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2 text-slate-400">
                                      {slot.first_name
                                        ? `${slot.first_name} ${slot.last_name || ''}`.trim()
                                        : slot.candidate_name || <span className="text-slate-200">—</span>}
                                    </td>
                                    <td className="px-4 py-2 text-right">
                                      {canManageSlots && slot.status === 'open' && (
                                        <button
                                          onClick={() => handleDeleteSlot(r, slot.id)}
                                          className="text-red-400 hover:text-red-600 text-xs"
                                        >
                                          Remove
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}

                          {canManageSlots && (
                            <div className="px-4 py-3 border-t border-emerald-100 bg-white">
                              {wdState(r.id).err && (
                                <p className="text-xs text-red-500 mb-2">{wdState(r.id).err}</p>
                              )}
                              <div className="flex items-end gap-2">
                                <div>
                                  <label className="block text-xs text-slate-500 mb-1">WD Req ID *</label>
                                  <input
                                    value={wdState(r.id).newWdReqId}
                                    onChange={e => setWd(r.id, { newWdReqId: e.target.value })}
                                    placeholder="JR000001"
                                    className="w-28 border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs text-slate-500 mb-1">Label (optional)</label>
                                  <input
                                    value={wdState(r.id).newLabel}
                                    onChange={e => setWd(r.id, { newLabel: e.target.value })}
                                    placeholder="e.g. HC Slot 1"
                                    className="w-36 border border-slate-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                  />
                                </div>
                                <button
                                  onClick={() => handleAddSlot(r)}
                                  disabled={!wdState(r.id).newWdReqId.trim() || wdState(r.id).adding}
                                  className="px-3 py-1.5 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                                >
                                  {wdState(r.id).adding ? 'Adding…' : '+ Add Slot'}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {error && (
        <p className="text-red-600 text-sm mb-4 bg-red-50 border border-red-100 rounded-lg px-4 py-2">{error}</p>
      )}

      {/* Add new req */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Add New Requisition</h3>
        <form onSubmit={handleAdd} className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-slate-500 mb-1">First Slot # *</label>
            <input
              required
              value={form.initial_slot}
              onChange={set('initial_slot')}
              placeholder="JR101224"
              className="w-28 border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex-1 min-w-48">
            <label className="block text-xs text-slate-500 mb-1">Title *</label>
            <input
              required
              value={form.title}
              onChange={set('title')}
              placeholder="Senior Software Engineer"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Department</label>
            <input
              value={form.department}
              onChange={set('department')}
              placeholder="Engineering"
              className="w-36 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Hiring Manager</label>
            <select
              value={form.hiring_manager}
              onChange={set('hiring_manager')}
              className="w-44 border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Select —</option>
              {hmUsers.map(u => (
                <option key={u.id} value={u.name}>{u.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Recruiter</label>
            <select
              value={form.recruiter}
              onChange={set('recruiter')}
              className="w-44 border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Select —</option>
              {users.map(u => (
                <option key={u.id} value={u.name}>{u.name}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-48">
            <label className="block text-xs text-slate-500 mb-1">Scorecard</label>
            <input
              value={form.script_doc_url}
              onChange={set('script_doc_url')}
              placeholder="https://docs.google.com/…"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Interview Plan</label>
            <select
              value={form.plan_id}
              onChange={set('plan_id')}
              className="w-44 border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— None —</option>
              {plans.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Status</label>
            <select
              value={form.status}
              onChange={set('status')}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="open">Open</option>
              <option value="on_hold">On Hold</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Priority</label>
            <select
              value={form.priority}
              onChange={set('priority')}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="critical">P1 · Critical</option>
              <option value="high">P2 · High</option>
              <option value="medium">P3 · Medium</option>
              <option value="low">P4 · Low</option>
            </select>
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Add Req
          </button>
        </form>
      </div>
    </div>
  );
}
