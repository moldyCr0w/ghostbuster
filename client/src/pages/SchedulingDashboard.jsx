import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

/* ── constants ──────────────────────────────────────────────── */
const STATUSES = [
  { key: 'to_be_scheduled', label: 'To Be Scheduled', color: 'blue',   icon: '📅' },
  { key: 'in_progress',     label: 'In Progress',     color: 'yellow', icon: '⏳' },
  { key: 'scheduled',       label: 'Scheduled',       color: 'green',  icon: '✅' },
  { key: 'cancelled',       label: 'Cancelled',       color: 'slate',  icon: '🚫' },
];

const STATUS_STYLES = {
  to_be_scheduled: 'bg-blue-50 border-blue-200',
  in_progress:     'bg-yellow-50 border-yellow-200',
  scheduled:       'bg-green-50 border-green-200',
  cancelled:       'bg-slate-50 border-slate-200 opacity-60',
};

const STATUS_BADGE = {
  to_be_scheduled: 'bg-blue-100 text-blue-700',
  in_progress:     'bg-yellow-100 text-yellow-700',
  scheduled:       'bg-green-100 text-green-700',
  cancelled:       'bg-slate-100 text-slate-500',
};

const COL_HEADER = {
  blue:   'bg-blue-600',
  yellow: 'bg-yellow-500',
  green:  'bg-green-600',
  slate:  'bg-slate-500',
};

/* ── availability display ───────────────────────────────────── */
function AvailabilityList({ windows }) {
  if (!windows || windows.length === 0) {
    return <span className="text-slate-400 italic text-xs">No availability provided</span>;
  }
  return (
    <ul className="space-y-0.5">
      {windows.map((w, i) => (
        <li key={i} className="text-xs text-slate-600">
          <span className="font-medium">{w.date}</span>
          {w.start && w.end && <span className="text-slate-400"> · {w.start}–{w.end}</span>}
        </li>
      ))}
    </ul>
  );
}

/* ── request card ───────────────────────────────────────────── */
function RequestCard({ request, coordinators, onUpdate, onDelete, isAdmin, isCoordinator }) {
  const [expanded, setExpanded] = useState(false);

  const handleStatusChange = (newStatus) => {
    onUpdate(request.id, { status: newStatus });
  };

  const handleCoordinatorChange = (e) => {
    const val = e.target.value;
    onUpdate(request.id, { coordinator_id: val ? Number(val) : null });
  };

  const handleInterviewDateChange = (e) => {
    onUpdate(request.id, { interview_date: e.target.value || null });
  };

  const nextStatuses = STATUSES.filter(s => s.key !== request.status);

  return (
    <div
      className={`rounded-lg border p-3 cursor-pointer hover:shadow-md transition-shadow ${STATUS_STYLES[request.status]}`}
      onClick={() => setExpanded(e => !e)}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800 leading-tight truncate">
            {request.candidate_name}
          </p>
          {request.req_title && (
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              {request.req_number} · {request.req_title}
            </p>
          )}
        </div>
        {request.stage_name && (
          <span className="shrink-0 px-1.5 py-0.5 text-xs rounded-full font-medium bg-purple-100 text-purple-700">
            {request.stage_name}
          </span>
        )}
      </div>

      {/* Submitted by / date */}
      <p className="text-xs text-slate-400 mt-1.5">
        Submitted by {request.submitted_by_name || 'unknown'}
        {' · '}{new Date(request.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
      </p>

      {/* Coordinator tag */}
      {request.coordinator_name && (
        <p className="text-xs text-slate-500 mt-0.5">
          <span className="text-slate-400">Coord:</span> {request.coordinator_name}
        </p>
      )}

      {/* Interview date */}
      {request.interview_date && (
        <p className="text-xs text-green-600 mt-0.5 font-medium">
          Interview: {new Date(request.interview_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
        </p>
      )}

      {/* Expanded detail */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-slate-200 space-y-3" onClick={e => e.stopPropagation()}>

          {/* Availability */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Availability</p>
            <AvailabilityList windows={request.availability} />
          </div>

          {/* Notes */}
          {request.notes && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Notes</p>
              <p className="text-xs text-slate-600 whitespace-pre-wrap">{request.notes}</p>
            </div>
          )}

          {/* Coordinator actions (coordinators + admins) */}
          {(isCoordinator || isAdmin) && (
            <>
              {/* Assign coordinator */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Assign Coordinator</p>
                <select
                  value={request.coordinator_id || ''}
                  onChange={handleCoordinatorChange}
                  className="w-full text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— Unassigned —</option>
                  {coordinators.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Interview date */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Interview Date</p>
                <input
                  type="date"
                  value={request.interview_date || ''}
                  onChange={handleInterviewDateChange}
                  className="w-full text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Move to next status */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Move To</p>
                <div className="flex flex-wrap gap-1.5">
                  {nextStatuses.map(s => (
                    <button
                      key={s.key}
                      onClick={() => handleStatusChange(s.key)}
                      className="px-2.5 py-1 text-xs rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
                    >
                      {s.icon} {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Admin delete */}
          {isAdmin && (
            <button
              onClick={() => { if (window.confirm('Delete this request?')) onDelete(request.id); }}
              className="text-xs text-red-500 hover:text-red-700 transition-colors"
            >
              Delete request
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── new request modal ──────────────────────────────────────── */
function NewRequestModal({ onClose, onSubmit, candidates, stages, reqs }) {
  const [form, setForm] = useState({
    candidate_id: '',
    req_id:       '',
    stage_id:     '',
    notes:        '',
  });
  const [windows, setWindows] = useState([{ date: '', start: '', end: '' }]);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [search, setSearch]   = useState('');

  const filteredCandidates = candidates.filter(c =>
    !search || c.display_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.name?.toLowerCase().includes(search.toLowerCase())
  );

  const addWindow = () => setWindows(w => [...w, { date: '', start: '', end: '' }]);
  const removeWindow = (i) => setWindows(w => w.filter((_, idx) => idx !== i));
  const updateWindow = (i, field, value) => {
    setWindows(w => w.map((win, idx) => idx === i ? { ...win, [field]: value } : win));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.candidate_id) { setError('Please select a candidate.'); return; }
    const validWindows = windows.filter(w => w.date);
    if (validWindows.length === 0) { setError('Add at least one availability date.'); return; }

    setSaving(true);
    try {
      await onSubmit({
        ...form,
        candidate_id: Number(form.candidate_id),
        req_id:   form.req_id   ? Number(form.req_id)   : null,
        stage_id: form.stage_id ? Number(form.stage_id) : null,
        availability: validWindows,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to submit request');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800">New Scheduling Request</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Candidate */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Candidate <span className="text-red-400">*</span></label>
            <input
              type="text"
              placeholder="Search candidates..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 mb-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={form.candidate_id}
              onChange={e => setForm(f => ({ ...f, candidate_id: e.target.value }))}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              size={Math.min(5, filteredCandidates.length + 1)}
            >
              <option value="">— Select candidate —</option>
              {filteredCandidates.map(c => (
                <option key={c.id} value={c.id}>
                  {c.display_name || c.name}{c.email ? ` · ${c.email}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Stage */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Interview Stage <span className="text-red-400">*</span></label>
            <select
              value={form.stage_id}
              onChange={e => setForm(f => ({ ...f, stage_id: e.target.value }))}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Select stage —</option>
              {stages.filter(s => !s.is_terminal).map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Req */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Requisition <span className="text-slate-400">(optional)</span></label>
            <select
              value={form.req_id}
              onChange={e => setForm(f => ({ ...f, req_id: e.target.value }))}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Select req —</option>
              {reqs.filter(r => r.status === 'open').map(r => (
                <option key={r.id} value={r.id}>{r.req_id} · {r.title}</option>
              ))}
            </select>
          </div>

          {/* Availability windows */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-600">Candidate Availability <span className="text-red-400">*</span></label>
              <button
                type="button"
                onClick={addWindow}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                + Add window
              </button>
            </div>
            <div className="space-y-2">
              {windows.map((w, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="date"
                    value={w.date}
                    onChange={e => updateWindow(i, 'date', e.target.value)}
                    className="flex-1 text-xs border border-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="time"
                    value={w.start}
                    onChange={e => updateWindow(i, 'start', e.target.value)}
                    placeholder="Start"
                    className="w-24 text-xs border border-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-slate-400 text-xs">–</span>
                  <input
                    type="time"
                    value={w.end}
                    onChange={e => updateWindow(i, 'end', e.target.value)}
                    placeholder="End"
                    className="w-24 text-xs border border-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {windows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeWindow(i)}
                      className="text-slate-400 hover:text-red-500 text-sm leading-none"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Notes <span className="text-slate-400">(optional)</span></label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={3}
              placeholder="Any special instructions for the coordinator..."
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors"
            >
              {saving ? 'Submitting…' : 'Submit Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── main page ──────────────────────────────────────────────── */
export default function SchedulingDashboard() {
  const { user }                    = useAuth();
  const [requests, setRequests]     = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [stages, setStages]         = useState([]);
  const [reqs, setReqs]             = useState([]);
  const [coordinators, setCoordinators] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showModal, setShowModal]   = useState(false);

  const isAdmin       = user?.role === 'admin';
  const isCoordinator = user?.role === 'coordinator' || isAdmin;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [reqs_, candidates_, stages_, users_] = await Promise.all([
        api.getSchedulingRequests(),
        api.getCandidates(),
        api.getStages(),
        api.getUsers(),
      ]);
      setRequests(Array.isArray(reqs_) ? reqs_ : []);
      setCandidates(Array.isArray(candidates_) ? candidates_ : []);
      setStages(Array.isArray(stages_) ? stages_ : []);
      const allUsers = Array.isArray(users_) ? users_ : [];
      setCoordinators(allUsers.filter(u => u.role === 'coordinator'));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadReqs = useCallback(async () => {
    const r = await api.getReqs();
    setReqs(Array.isArray(r) ? r : []);
  }, []);

  useEffect(() => { load(); loadReqs(); }, [load, loadReqs]);

  const handleCreate = async (data) => {
    const created = await api.createSchedulingRequest(data);
    if (created?.error) throw new Error(created.error);
    setRequests(prev => [created, ...prev]);
  };

  const handleUpdate = async (id, data) => {
    const updated = await api.updateSchedulingRequest(id, data);
    if (updated?.error) return;
    setRequests(prev => prev.map(r => r.id === id ? updated : r));
  };

  const handleDelete = async (id) => {
    await api.deleteSchedulingRequest(id);
    setRequests(prev => prev.filter(r => r.id !== id));
  };

  // Stats
  const counts = {};
  STATUSES.forEach(s => { counts[s.key] = requests.filter(r => r.status === s.key).length; });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="px-6 py-5 border-b border-slate-200 bg-white shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Scheduling Dashboard</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {requests.length} total · {counts.to_be_scheduled} to be scheduled · {counts.in_progress} in progress
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
          >
            <span>+</span>
            <span>New Request</span>
          </button>
        </div>
      </div>

      {/* Kanban board */}
      <div className="flex-1 overflow-x-auto p-6">
        <div className="flex gap-4 h-full min-w-max">
          {STATUSES.map(col => {
            const colRequests = requests.filter(r => r.status === col.key);
            return (
              <div key={col.key} className="flex flex-col w-72 shrink-0">
                {/* Column header */}
                <div className={`flex items-center justify-between px-3 py-2.5 rounded-t-xl text-white ${COL_HEADER[col.color]}`}>
                  <div className="flex items-center gap-1.5">
                    <span>{col.icon}</span>
                    <span className="text-sm font-semibold">{col.label}</span>
                  </div>
                  <span className="px-2 py-0.5 bg-white/20 text-white text-xs font-bold rounded-full">
                    {colRequests.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto bg-slate-100 rounded-b-xl p-2 space-y-2 min-h-24">
                  {colRequests.length === 0 ? (
                    <p className="text-xs text-slate-400 italic text-center py-6">No requests</p>
                  ) : (
                    colRequests.map(r => (
                      <RequestCard
                        key={r.id}
                        request={r}
                        coordinators={coordinators}
                        onUpdate={handleUpdate}
                        onDelete={handleDelete}
                        isAdmin={isAdmin}
                        isCoordinator={isCoordinator}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* New request modal */}
      {showModal && (
        <NewRequestModal
          onClose={() => setShowModal(false)}
          onSubmit={handleCreate}
          candidates={candidates}
          stages={stages}
          reqs={reqs}
        />
      )}
    </div>
  );
}
