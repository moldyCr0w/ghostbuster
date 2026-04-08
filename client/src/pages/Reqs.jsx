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

const ROLE_RANK = { recruiter: 1, senior_recruiter: 2, admin: 3 };
const EMPTY_PLAN_ENTRY = { stage_id: '', interview_name: '', interview_type_id: '', notes: '' };

export default function Reqs() {
  const { user }                  = useAuth();
  const canEdit                   = ROLE_RANK[user?.role] >= ROLE_RANK.senior_recruiter;
  const [reqs, setReqs]         = useState([]);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [editId, setEditId]     = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(true);
  const [users, setUsers]       = useState([]);   // recruiters (also sourcers)
  const [hmUsers, setHmUsers]   = useState([]);   // hiring managers

  // ── Interview plan state ──────────────────────────────────
  const [stages, setStages]           = useState([]);
  const [interviewTypes, setITypes]   = useState([]);
  const [expandedPlanId, setExpandedPlanId] = useState(null);
  const [plans, setPlans]             = useState({});  // reqId → entries[]
  const [planNewEntry, setPlanNewEntry] = useState(EMPTY_PLAN_ENTRY);
  const [planEditId, setPlanEditId]   = useState(null);
  const [planEditEntry, setPlanEditEntry] = useState(EMPTY_PLAN_ENTRY);

  const load = useCallback(async () => {
    setReqs(await api.getReqs());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Load user lists for dropdowns + stages for plan
  useEffect(() => {
    api.getUsers().then(setUsers).catch(() => {});
    api.getHmUsers().then(setHmUsers).catch(() => {});
    api.getStages().then(s => setStages(Array.isArray(s) ? s : [])).catch(() => {});
    api.getInterviewTypes().then(t => setITypes(Array.isArray(t) ? t : [])).catch(() => {});
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

  // ── Interview plan handlers ───────────────────────────────
  const togglePlan = async (reqId) => {
    if (expandedPlanId === reqId) {
      setExpandedPlanId(null);
      return;
    }
    setExpandedPlanId(reqId);
    if (!plans[reqId]) {
      const entries = await api.getReqInterviewPlan(reqId);
      setPlans(p => ({ ...p, [reqId]: Array.isArray(entries) ? entries : [] }));
    }
    setPlanNewEntry(EMPTY_PLAN_ENTRY);
    setPlanEditId(null);
  };

  const refreshPlan = async (reqId) => {
    const entries = await api.getReqInterviewPlan(reqId);
    setPlans(p => ({ ...p, [reqId]: Array.isArray(entries) ? entries : [] }));
  };

  const handleAddPlanEntry = async (reqId) => {
    if (!planNewEntry.stage_id || !planNewEntry.interview_name.trim()) return;
    await api.addInterviewPlanEntry(reqId, {
      stage_id:          Number(planNewEntry.stage_id),
      interview_name:    planNewEntry.interview_name.trim(),
      interview_type_id: planNewEntry.interview_type_id ? Number(planNewEntry.interview_type_id) : null,
      notes:             planNewEntry.notes || null,
    });
    setPlanNewEntry(EMPTY_PLAN_ENTRY);
    await refreshPlan(reqId);
  };

  const handleDeletePlanEntry = async (reqId, entryId) => {
    await api.deleteInterviewPlanEntry(reqId, entryId);
    await refreshPlan(reqId);
  };

  const startEditPlanEntry = (entry) => {
    setPlanEditId(entry.id);
    setPlanEditEntry({
      stage_id:          String(entry.stage_id),
      interview_name:    entry.interview_name,
      interview_type_id: entry.interview_type_id ? String(entry.interview_type_id) : '',
      notes:             entry.notes || '',
    });
  };

  const handleUpdatePlanEntry = async (reqId, entryId) => {
    if (!planEditEntry.interview_name.trim()) return;
    await api.updateInterviewPlanEntry(reqId, entryId, {
      interview_name:    planEditEntry.interview_name.trim(),
      interview_type_id: planEditEntry.interview_type_id ? Number(planEditEntry.interview_type_id) : null,
      notes:             planEditEntry.notes || null,
      order_index:       0,
    });
    setPlanEditId(null);
    await refreshPlan(reqId);
  };

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
                              className={`px-2.5 py-1 text-xs rounded-lg ${
                                expandedPlanId === r.id
                                  ? 'bg-indigo-100 text-indigo-700'
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              }`}
                            >
                              📋 Plan
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
                {/* ── Interview Plan row ── */}
                {expandedPlanId === r.id && (
                  <tr className="bg-indigo-50/50">
                    <td colSpan={6} className="px-6 py-4">
                      <p className="text-xs font-semibold text-indigo-700 mb-3">📋 Interview Plan — {r.title}</p>
                      {(plans[r.id]?.length ?? 0) === 0 ? (
                        <p className="text-xs text-slate-400 italic mb-3">No plan entries yet.</p>
                      ) : (
                        <table className="w-full text-xs mb-3">
                          <thead>
                            <tr className="text-left text-slate-500 border-b border-indigo-100">
                              <th className="pb-1 pr-3 font-medium">Stage</th>
                              <th className="pb-1 pr-3 font-medium">Interview Name</th>
                              <th className="pb-1 pr-3 font-medium">Type</th>
                              <th className="pb-1 pr-3 font-medium">Notes</th>
                              {canEdit && <th className="pb-1" />}
                            </tr>
                          </thead>
                          <tbody>
                            {(plans[r.id] || []).map(entry => (
                              <tr key={entry.id} className="border-b border-indigo-50">
                                {planEditId === entry.id ? (
                                  <td colSpan={canEdit ? 5 : 4} className="py-2">
                                    <div className="flex flex-wrap gap-2 items-end">
                                      <input
                                        autoFocus
                                        value={planEditEntry.interview_name}
                                        onChange={e => setPlanEditEntry(f => ({ ...f, interview_name: e.target.value }))}
                                        placeholder="Interview name"
                                        className="border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                      />
                                      <select
                                        value={planEditEntry.interview_type_id}
                                        onChange={e => setPlanEditEntry(f => ({ ...f, interview_type_id: e.target.value }))}
                                        className="border border-slate-300 rounded px-2 py-1 text-xs bg-white focus:outline-none"
                                      >
                                        <option value="">— Type (optional) —</option>
                                        {interviewTypes.map(it => (
                                          <option key={it.id} value={it.id}>{it.name}</option>
                                        ))}
                                      </select>
                                      <input
                                        value={planEditEntry.notes}
                                        onChange={e => setPlanEditEntry(f => ({ ...f, notes: e.target.value }))}
                                        placeholder="Notes"
                                        className="border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none"
                                      />
                                      <button onClick={() => handleUpdatePlanEntry(r.id, entry.id)} className="px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs">Save</button>
                                      <button onClick={() => setPlanEditId(null)} className="px-2 py-1 bg-slate-100 text-slate-600 rounded hover:bg-slate-200 text-xs">Cancel</button>
                                    </div>
                                  </td>
                                ) : (
                                  <>
                                    <td className="py-2 pr-3">
                                      <span className="px-1.5 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: (entry.stage_color || '#6B7280') + '25', color: entry.stage_color || '#6B7280' }}>
                                        {entry.stage_name}
                                      </span>
                                    </td>
                                    <td className="py-2 pr-3 font-medium text-slate-700">{entry.interview_name}</td>
                                    <td className="py-2 pr-3 text-slate-500">{entry.interview_type_name || <span className="text-slate-300">—</span>}</td>
                                    <td className="py-2 pr-3 text-slate-500">{entry.notes || <span className="text-slate-300">—</span>}</td>
                                    {canEdit && (
                                      <td className="py-2 whitespace-nowrap">
                                        <button onClick={() => startEditPlanEntry(entry)} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded hover:bg-slate-200 mr-1">Edit</button>
                                        <button onClick={() => handleDeletePlanEntry(r.id, entry.id)} className="px-2 py-0.5 bg-red-50 text-red-500 rounded hover:bg-red-100">Delete</button>
                                      </td>
                                    )}
                                  </>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                      {canEdit && (
                        <div className="flex flex-wrap gap-2 items-end pt-1 border-t border-indigo-100">
                          <p className="text-xs text-slate-500 font-medium w-full mb-1">Add entry:</p>
                          <select
                            value={planNewEntry.stage_id}
                            onChange={e => setPlanNewEntry(f => ({ ...f, stage_id: e.target.value }))}
                            className="border border-slate-300 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          >
                            <option value="">Stage *</option>
                            {stages.filter(s => !s.is_terminal).map(s => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                          <input
                            value={planNewEntry.interview_name}
                            onChange={e => setPlanNewEntry(f => ({ ...f, interview_name: e.target.value }))}
                            placeholder="Interview name *"
                            className="border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                          <select
                            value={planNewEntry.interview_type_id}
                            onChange={e => setPlanNewEntry(f => ({ ...f, interview_type_id: e.target.value }))}
                            className="border border-slate-300 rounded px-2 py-1 text-xs bg-white focus:outline-none"
                          >
                            <option value="">— Type (optional) —</option>
                            {interviewTypes.map(it => (
                              <option key={it.id} value={it.id}>{it.name}</option>
                            ))}
                          </select>
                          <input
                            value={planNewEntry.notes}
                            onChange={e => setPlanNewEntry(f => ({ ...f, notes: e.target.value }))}
                            placeholder="Notes"
                            className="border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none"
                          />
                          <button
                            onClick={() => handleAddPlanEntry(r.id)}
                            disabled={!planNewEntry.stage_id || !planNewEntry.interview_name.trim()}
                            className="px-3 py-1 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            + Add
                          </button>
                        </div>
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
      <div className="bg-white rounded-xl border border-slate-200 p-5">
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
      </div>
    </div>
  );
}
