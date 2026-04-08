import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

const STATUS_STYLES = {
  open:     'bg-green-100 text-green-700 border border-green-200',
  on_hold:  'bg-amber-100 text-amber-700 border border-amber-200',
  closed:   'bg-slate-100 text-slate-500 border border-slate-200',
};
const STATUS_LABELS = { open: 'Open', on_hold: 'On Hold', closed: 'Closed' };

const EMPTY_FORM = { req_id: '', title: '', department: '', status: 'open', hiring_manager: '', recruiter: '', script_doc_url: '' };

export default function Reqs() {
  const { user: me }            = useAuth();
  const canEdit                 = me?.role === 'senior_recruiter' || me?.role === 'admin';

  const [reqs, setReqs]         = useState([]);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [editId, setEditId]     = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(true);
  const [users, setUsers]       = useState([]);
  const [hmUsers, setHmUsers]   = useState([]);

  // ── Interview plan state ─────────────────────────────────────
  const [stages, setStages]               = useState([]);
  const [interviewTypes, setInterviewTypes] = useState([]);
  const [expandedPlanId, setExpandedPlanId] = useState(null);
  const [planEntries, setPlanEntries]     = useState({});   // { [reqId]: entries[] }
  const [planLoading, setPlanLoading]     = useState(false);
  const [planForm, setPlanForm]           = useState({ stage_id: '', interview_name: '', interview_type_id: '', notes: '' });
  const [planFormError, setPlanFormError] = useState('');
  const [editingEntryId, setEditingEntryId] = useState(null);
  const [editEntryForm, setEditEntryForm] = useState({ stage_id: '', interview_name: '', interview_type_id: '', notes: '' });
  const [editEntryError, setEditEntryError] = useState('');

  const load = useCallback(async () => {
    setReqs(await api.getReqs());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Load user lists + stages + interview types for dropdowns
  useEffect(() => {
    api.getUsers().then(setUsers).catch(() => {});
    api.getHmUsers().then(setHmUsers).catch(() => {});
    api.getStages().then(data => setStages(Array.isArray(data) ? data.filter(s => !s.is_terminal) : [])).catch(() => {});
    api.getInterviewTypes().then(data => setInterviewTypes(Array.isArray(data) ? data : [])).catch(() => {});
  }, []);

  const set    = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));
  const setEdit= (field) => (e) => setEditForm(f => ({ ...f, [field]: e.target.value }));

  const handleAdd = async (e) => {
    e.preventDefault();
    setError('');
    const res = await api.createReq(form);
    if (res.error) { setError(res.error); return; }
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
    setEditForm({ req_id: r.req_id, title: r.title, department: r.department || '', status: r.status, hiring_manager: r.hiring_manager || '', recruiter: r.recruiter || '', script_doc_url: r.script_doc_url || '' });
  };

  const saveEdit = async (r) => {
    setError('');
    const res = await api.updateReq(r.id, editForm);
    if (res.error) { setError(res.error); return; }
    setEditId(null);
    load();
  };

  // ── Interview plan handlers ──────────────────────────────────
  const loadPlan = useCallback(async (reqId) => {
    setPlanLoading(true);
    const data = await api.getReqInterviewPlan(reqId).catch(() => []);
    setPlanEntries(prev => ({ ...prev, [reqId]: Array.isArray(data) ? data : [] }));
    setPlanLoading(false);
  }, []);

  const togglePlan = useCallback((reqId) => {
    if (expandedPlanId === reqId) {
      setExpandedPlanId(null);
    } else {
      setExpandedPlanId(reqId);
      if (!planEntries[reqId]) loadPlan(reqId);
      setPlanForm({ stage_id: '', interview_name: '', interview_type_id: '', notes: '' });
      setPlanFormError('');
      setEditingEntryId(null);
    }
  }, [expandedPlanId, planEntries, loadPlan]);

  const handleAddPlanEntry = useCallback(async (reqId, e) => {
    e.preventDefault();
    setPlanFormError('');
    if (!planForm.stage_id)         { setPlanFormError('Stage is required'); return; }
    if (!planForm.interview_name.trim()) { setPlanFormError('Interview name is required'); return; }
    const res = await api.addInterviewPlanEntry(reqId, {
      stage_id:          planForm.stage_id,
      interview_name:    planForm.interview_name.trim(),
      interview_type_id: planForm.interview_type_id || null,
      notes:             planForm.notes || null,
    });
    if (res.error) { setPlanFormError(res.error); return; }
    setPlanForm({ stage_id: '', interview_name: '', interview_type_id: '', notes: '' });
    loadPlan(reqId);
  }, [planForm, loadPlan]);

  const startEditEntry = useCallback((entry) => {
    setEditingEntryId(entry.id);
    setEditEntryForm({ stage_id: String(entry.stage_id), interview_name: entry.interview_name, interview_type_id: entry.interview_type_id ? String(entry.interview_type_id) : '', notes: entry.notes || '' });
    setEditEntryError('');
  }, []);

  const handleUpdateEntry = useCallback(async (reqId, entryId, e) => {
    e.preventDefault();
    setEditEntryError('');
    if (!editEntryForm.interview_name.trim()) { setEditEntryError('Interview name is required'); return; }
    const res = await api.updateInterviewPlanEntry(reqId, entryId, {
      stage_id:          editEntryForm.stage_id,
      interview_name:    editEntryForm.interview_name.trim(),
      interview_type_id: editEntryForm.interview_type_id || null,
      notes:             editEntryForm.notes || null,
    });
    if (res.error) { setEditEntryError(res.error); return; }
    setEditingEntryId(null);
    loadPlan(reqId);
  }, [editEntryForm, loadPlan]);

  const handleDeleteEntry = useCallback(async (reqId, entryId) => {
    if (!window.confirm('Delete this plan entry?')) return;
    await api.deleteInterviewPlanEntry(reqId, entryId);
    loadPlan(reqId);
  }, [loadPlan]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-slate-400 text-sm">Loading…</span>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Requisitions</h1>
        <p className="text-slate-400 text-sm mt-0.5">
          Track open roles and link candidates to the reqs they're being considered for
        </p>
      </div>

      {/* Reqs table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-5">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700">All Requisitions</p>
          <p className="text-xs text-slate-400">{reqs.length} total</p>
        </div>

        {reqs.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-sm">
            No requisitions yet — add one below.
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide whitespace-nowrap">Req ID</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">Title</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide whitespace-nowrap">Department</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">Candidates</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reqs.map(r => (
                <React.Fragment key={r.id}>
                <tr className="hover:bg-slate-50">
                    {editId === r.id ? (
                      /* ── edit row ── */
                      <td colSpan={6} className="px-4 py-3">
                        <div className="flex flex-wrap gap-2 items-end">
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">Req ID</label>
                            <input
                              autoFocus
                              value={editForm.req_id}
                              onChange={setEdit('req_id')}
                              className="w-28 border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div className="flex-1 min-w-40">
                            <label className="block text-xs text-slate-500 mb-1">Title</label>
                            <input
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
                          <div className="flex-1 min-w-48">
                            <label className="block text-xs text-slate-500 mb-1">Scorecard</label>
                            <input
                              value={editForm.script_doc_url}
                              onChange={setEdit('script_doc_url')}
                              placeholder="https://docs.google.com/..."
                              className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
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
                        <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-700 whitespace-nowrap">{r.req_id}</td>
                        <td className="px-4 py-3 font-medium text-slate-800">{r.title}</td>
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{r.department || <span className="text-slate-300">—</span>}</td>
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
                        <td className="px-3 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 justify-end">
                            <button
                              onClick={() => togglePlan(r.id)}
                              className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${
                                expandedPlanId === r.id
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              }`}
                            >
                              📋 Plan {expandedPlanId === r.id ? '▲' : '▼'}
                            </button>
                            {canEdit && (
                              <>
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
                              </>
                            )}
                          </div>
                        </td>
                      </>
                    )}
                  </tr>

                  {/* ── Interview plan expanded row ── */}
                  {expandedPlanId === r.id && (
                    <tr className="bg-blue-50/40">
                      <td colSpan={6} className="px-6 py-4">
                        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-3">Interview Plan</p>

                        {/* Existing entries */}
                        {planLoading ? (
                          <p className="text-xs text-slate-400 italic">Loading…</p>
                        ) : (planEntries[r.id] || []).length === 0 ? (
                          <p className="text-xs text-slate-400 italic mb-3">No entries yet.</p>
                        ) : (
                          <div className="overflow-x-auto mb-4">
                            <table className="w-full text-xs border border-slate-200 rounded-lg overflow-hidden">
                              <thead className="bg-slate-100">
                                <tr>
                                  <th className="text-left px-3 py-2 font-semibold text-slate-600">Stage</th>
                                  <th className="text-left px-3 py-2 font-semibold text-slate-600">Interview Name</th>
                                  <th className="text-left px-3 py-2 font-semibold text-slate-600">Type</th>
                                  <th className="text-left px-3 py-2 font-semibold text-slate-600">Notes</th>
                                  {canEdit && <th className="px-3 py-2" />}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 bg-white">
                                {(planEntries[r.id] || []).map(entry => (
                                  editingEntryId === entry.id ? (
                                    <tr key={entry.id} className="bg-blue-50">
                                      <td className="px-3 py-2">
                                        <select
                                          value={editEntryForm.stage_id}
                                          onChange={e => setEditEntryForm(f => ({ ...f, stage_id: e.target.value }))}
                                          className="border border-slate-300 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                        >
                                          <option value="">— Stage —</option>
                                          {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                        </select>
                                      </td>
                                      <td className="px-3 py-2">
                                        <input
                                          value={editEntryForm.interview_name}
                                          onChange={e => setEditEntryForm(f => ({ ...f, interview_name: e.target.value }))}
                                          className="border border-slate-300 rounded px-2 py-1 text-xs w-40 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                        />
                                      </td>
                                      <td className="px-3 py-2">
                                        <select
                                          value={editEntryForm.interview_type_id}
                                          onChange={e => setEditEntryForm(f => ({ ...f, interview_type_id: e.target.value }))}
                                          className="border border-slate-300 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                        >
                                          <option value="">None</option>
                                          {interviewTypes.map(it => <option key={it.id} value={it.id}>{it.name}</option>)}
                                        </select>
                                      </td>
                                      <td className="px-3 py-2">
                                        <input
                                          value={editEntryForm.notes}
                                          onChange={e => setEditEntryForm(f => ({ ...f, notes: e.target.value }))}
                                          placeholder="optional"
                                          className="border border-slate-300 rounded px-2 py-1 text-xs w-full focus:outline-none focus:ring-1 focus:ring-blue-500"
                                        />
                                      </td>
                                      <td className="px-3 py-2">
                                        {editEntryError && <span className="text-red-500 mr-2">{editEntryError}</span>}
                                        <button onClick={(e) => handleUpdateEntry(r.id, entry.id, e)} className="text-blue-600 hover:text-blue-800 font-semibold mr-2">Save</button>
                                        <button onClick={() => setEditingEntryId(null)} className="text-slate-400 hover:text-slate-600">Cancel</button>
                                      </td>
                                    </tr>
                                  ) : (
                                    <tr key={entry.id}>
                                      <td className="px-3 py-2">
                                        <span className="flex items-center gap-1.5">
                                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.stage_color || '#94a3b8' }} />
                                          {entry.stage_name}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2 font-medium text-slate-800">{entry.interview_name}</td>
                                      <td className="px-3 py-2 text-slate-500">{entry.interview_type_name || <span className="text-slate-300">—</span>}</td>
                                      <td className="px-3 py-2 text-slate-500 max-w-xs truncate">{entry.notes || <span className="text-slate-300">—</span>}</td>
                                      {canEdit && (
                                        <td className="px-3 py-2 whitespace-nowrap">
                                          <button onClick={() => startEditEntry(entry)} className="text-slate-400 hover:text-blue-600 mr-2">Edit</button>
                                          <button onClick={() => handleDeleteEntry(r.id, entry.id)} className="text-slate-400 hover:text-red-500">Delete</button>
                                        </td>
                                      )}
                                    </tr>
                                  )
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* Add new entry form */}
                        {canEdit && (
                          <form onSubmit={(e) => handleAddPlanEntry(r.id, e)} className="flex flex-wrap gap-2 items-end">
                            <div>
                              <label className="block text-xs text-slate-500 mb-1">Stage *</label>
                              <select
                                value={planForm.stage_id}
                                onChange={e => setPlanForm(f => ({ ...f, stage_id: e.target.value }))}
                                className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                              >
                                <option value="">— Select stage —</option>
                                {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs text-slate-500 mb-1">Interview Name *</label>
                              <input
                                value={planForm.interview_name}
                                onChange={e => setPlanForm(f => ({ ...f, interview_name: e.target.value }))}
                                placeholder="e.g. Pair Coding Session"
                                className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs w-44 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-slate-500 mb-1">Type</label>
                              <select
                                value={planForm.interview_type_id}
                                onChange={e => setPlanForm(f => ({ ...f, interview_type_id: e.target.value }))}
                                className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                              >
                                <option value="">None</option>
                                {interviewTypes.map(it => <option key={it.id} value={it.id}>{it.name}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs text-slate-500 mb-1">Notes</label>
                              <input
                                value={planForm.notes}
                                onChange={e => setPlanForm(f => ({ ...f, notes: e.target.value }))}
                                placeholder="optional"
                                className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs w-36 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                            <div>
                              {planFormError && <p className="text-xs text-red-500 mb-1">{planFormError}</p>}
                              <button type="submit" className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700">
                                + Add Entry
                              </button>
                            </div>
                          </form>
                        )}
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
      {canEdit && <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Add New Requisition</h3>
        <form onSubmit={handleAdd} className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Req ID *</label>
            <input
              required
              value={form.req_id}
              onChange={set('req_id')}
              placeholder="JR-101"
              className="w-28 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Add Req
          </button>
        </form>
      </div>}
    </div>
  );
}
