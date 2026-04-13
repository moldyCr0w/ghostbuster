import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { localToday } from '../utils/dates';
import CandidateModal from '../components/CandidateModal';

/* ── Candidate card ──────────────────────────────────────────────── */
function CandidateCard({ candidate, today, onEdit, onDragStart }) {
  const isOverdue   = candidate.next_step_due && candidate.next_step_due < today;
  const isHmReview  = !!candidate.is_hm_review;
  const isPending   = !!candidate.pending_next_stage_id;

  return (
    <div
      draggable={!isPending}
      onDragStart={isPending ? undefined : (e => onDragStart(e, candidate.id))}
      onClick={() => onEdit(candidate)}
      className={`bg-white rounded-lg border p-3 cursor-pointer hover:shadow-md active:opacity-70 transition-shadow select-none ${
        isPending   ? 'border-teal-400 bg-teal-50 ring-1 ring-teal-300' :
        isOverdue   ? 'border-red-300 bg-red-50' :
        isHmReview  ? 'border-orange-300 bg-orange-50' :
        'border-slate-200'
      }`}
    >
      {/* Pending banner */}
      {isPending && (
        <div className="flex items-center gap-1 mb-2 px-1.5 py-0.5 bg-teal-100 rounded text-teal-700 text-xs font-semibold">
          <span>⏳</span>
          <span>Pending TA Action</span>
        </div>
      )}

      {/* Name */}
      <p className="text-sm font-semibold text-slate-800 leading-tight">
        {candidate.display_name || candidate.name}
      </p>

      {/* Email */}
      {candidate.email && (
        <p className="text-xs text-slate-400 mt-0.5 truncate">{candidate.email}</p>
      )}

      {/* Req badges */}
      {candidate.reqs?.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {candidate.reqs.map(r => (
            <span
              key={r.id}
              className="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-xs rounded font-mono"
            >
              {r.req_id}
            </span>
          ))}
        </div>
      )}

      {/* Status tags */}
      {isPending && candidate.pending_reason && (
        <p className="text-xs text-teal-600 mt-1.5 italic">{candidate.pending_reason}</p>
      )}
      {!isPending && isOverdue && (
        <p className="text-xs text-red-600 font-semibold mt-1.5">🚨 SLA overdue</p>
      )}
      {!isPending && isHmReview && !isOverdue && (
        <p className="text-xs text-orange-600 font-medium mt-1.5">🔍 Awaiting HM</p>
      )}

      {/* Resume indicator */}
      {candidate.resume_path && (
        <span className="inline-block mt-1.5 text-xs text-slate-400">📄</span>
      )}
    </div>
  );
}

/* ── Kanban column ───────────────────────────────────────────────── */
function KanbanColumn({ stage, candidates, today, onEdit, onDragStart, onDrop }) {
  const [dragOver, setDragOver] = useState(false);

  const handleDragOver = e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(true);
  };
  const handleDragLeave = () => setDragOver(false);
  const handleDrop = e => {
    e.preventDefault();
    setDragOver(false);
    const id = Number(e.dataTransfer.getData('candidateId'));
    if (id) onDrop(id, stage.id);
  };

  const pendingCandidates = candidates
    .filter(c => c._isPending)
    .sort((a, b) => {
      const na = (a.display_name || a.name || '').toLowerCase();
      const nb = (b.display_name || b.name || '').toLowerCase();
      return na < nb ? -1 : na > nb ? 1 : 0;
    });
  const activeCandidates  = candidates
    .filter(c => !c._isPending)
    .sort((a, b) => {
      const priority = c => {
        if (c.next_step_due && c.next_step_due < today) return 0; // overdue (green)
        if (c.is_hm_review) return 1;                             // awaiting HM (yellow)
        return 2;                                                  // default (white)
      };
      const pd = priority(a) - priority(b);
      if (pd !== 0) return pd;
      const na = (a.display_name || a.name || '').toLowerCase();
      const nb = (b.display_name || b.name || '').toLowerCase();
      return na < nb ? -1 : na > nb ? 1 : 0;
    });
  const overdue = activeCandidates.filter(c => c.next_step_due && c.next_step_due < today).length;

  return (
    <div className="flex flex-col w-56 shrink-0">
      {/* Column header */}
      <div
        className="flex items-center justify-between px-3 py-2 rounded-t-lg border border-b-0"
        style={{ backgroundColor: stage.color + '18', borderColor: stage.color + '50' }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
          <span className="text-xs font-semibold text-slate-700 truncate">{stage.name}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-1">
          {pendingCandidates.length > 0 && (
            <span className="text-xs font-bold text-teal-600 bg-teal-100 px-1 rounded">
              {pendingCandidates.length}⏳
            </span>
          )}
          {overdue > 0 && (
            <span className="text-xs font-bold text-red-500">{overdue}!</span>
          )}
          <span
            className="text-xs font-bold px-1.5 py-0.5 rounded-full"
            style={{ backgroundColor: stage.color + '25', color: stage.color }}
          >
            {activeCandidates.length}
          </span>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`flex-1 rounded-b-lg border p-2 space-y-2 overflow-y-auto transition-colors ${
          dragOver
            ? 'bg-blue-50 border-blue-400 border-2'
            : 'bg-slate-50/80 border-slate-200'
        }`}
        style={{ minHeight: 120, maxHeight: 'calc(100vh - 230px)' }}
      >
        {/* Pending transition candidates — shown at top, visually separated */}
        {pendingCandidates.length > 0 && (
          <>
            <div className="flex items-center gap-1.5 pt-0.5 pb-1">
              <div className="flex-1 h-px bg-teal-200" />
              <span className="text-xs text-teal-500 font-medium whitespace-nowrap">HM Approved</span>
              <div className="flex-1 h-px bg-teal-200" />
            </div>
            {pendingCandidates.map(c => (
              <CandidateCard
                key={`pending-${c.id}`}
                candidate={c}
                today={today}
                onEdit={onEdit}
                onDragStart={onDragStart}
              />
            ))}
            {activeCandidates.length > 0 && (
              <div className="flex items-center gap-1.5 py-1">
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-xs text-slate-400 font-medium whitespace-nowrap">In Stage</span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>
            )}
          </>
        )}

        {/* Active stage candidates */}
        {activeCandidates.map(c => (
          <CandidateCard
            key={c.id}
            candidate={c}
            today={today}
            onEdit={onEdit}
            onDragStart={onDragStart}
          />
        ))}
        {candidates.length === 0 && (
          <div className="flex items-center justify-center h-16">
            <span className="text-xs text-slate-300 italic select-none">Drop here</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Board page ──────────────────────────────────────────────────── */
export default function Board() {
  const [stages, setStages]         = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [reqs, setReqs]             = useState([]);
  const [loading, setLoading]       = useState(true);
  const [editingCandidate, setEditingCandidate] = useState(null);
  const [reqFilter, setReqFilter]   = useState('');
  const [movingId, setMovingId]     = useState(null); // optimistic: currently being moved

  const location   = useLocation();
  const navigate   = useNavigate();
  const handledRef = useRef(null); // prevent double-open on re-renders

  const load = useCallback(async () => {
    const [s, c, r] = await Promise.all([
      api.getStages(),
      api.getCandidates(),
      api.getReqs(),
    ]);
    setStages(s);
    setCandidates(c);
    setReqs(r);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // When navigated here from a notification, auto-open that candidate's modal
  useEffect(() => {
    const candidateId = location.state?.openCandidateId;
    if (!candidateId || handledRef.current === candidateId) return;
    handledRef.current = candidateId;

    // Clear location state so a page refresh doesn't re-open the modal
    navigate('/board', { replace: true, state: {} });

    // Load candidate by ID (works even if they're in a terminal stage)
    api.getCandidate(candidateId).then(c => {
      if (c && !c.error) setEditingCandidate(c);
    });
  }, [location.state?.openCandidateId, navigate]);

  /* ── Drag handlers ── */
  const handleDragStart = useCallback((e, candidateId) => {
    e.dataTransfer.setData('candidateId', String(candidateId));
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDrop = useCallback(async (candidateId, newStageId) => {
    const c = candidates.find(x => x.id === candidateId);
    if (!c || c.stage_id === newStageId) return;

    // Optimistic update — move card visually immediately
    const newStageData = stages.find(s => s.id === newStageId);
    setMovingId(candidateId);
    setCandidates(prev =>
      prev.map(x =>
        x.id === candidateId
          ? {
              ...x,
              stage_id:    newStageId,
              stage_name:  newStageData?.name  ?? x.stage_name,
              stage_color: newStageData?.color ?? x.stage_color,
              order_index: newStageData?.order_index ?? x.order_index,
              is_hm_review: newStageData?.is_hm_review ?? 0,
              is_terminal:  newStageData?.is_terminal  ?? 0,
            }
          : x
      )
    );

    // Persist to API
    await api.updateCandidate(candidateId, {
      first_name:   c.first_name,
      last_name:    c.last_name,
      email:        c.email,
      stage_id:     newStageId,
      linkedin_url: c.linkedin_url,
      wd_url:       c.wd_url,
      notes:        c.notes,
      req_ids:      (c.reqs || []).map(r => r.id),
    });

    setMovingId(null);
    // Reload for fresh SLA dates etc.
    const fresh = await api.getCandidates();
    setCandidates(fresh);
  }, [candidates, stages]);

  /* ── Modal save ── */
  const handleSave = useCallback(async (data) => {
    const { _resumeFile, _removeResume, _skipSave, ...fields } = data;
    if (!_skipSave && editingCandidate) {
      await api.updateCandidate(editingCandidate.id, fields);
      if (_removeResume) await api.deleteResume(editingCandidate.id);
      if (_resumeFile)   await api.uploadResume(editingCandidate.id, _resumeFile);
    }
    setEditingCandidate(null);
    load();
  }, [editingCandidate, load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-slate-400 text-sm">Loading…</span>
      </div>
    );
  }

  const today = localToday();

  // All stages except the "Hired" stage as columns, in order
  // This shows active stages + "Rejected / Closed" (declined) but hides "Hired"
  const hiredStageId = stages.find(s => s.is_hire)?.id;
  const columns = stages
    .filter(s => !(s.is_terminal && s.is_hire))
    .sort((a, b) => a.order_index - b.order_index);

  // Apply req filter
  const visibleCandidates = reqFilter
    ? candidates.filter(c => c.reqs?.some(r => String(r.id) === reqFilter))
    : candidates;

  // Exclude hired candidates — declined ones still show on the board
  const activeCandidates = visibleCandidates.filter(c => c.stage_id !== hiredStageId);

  // Build stage → candidate list
  // Candidates with a pending_next_stage_id appear in the TARGET column (flagged _isPending=true)
  // so recruiters see them separated from candidates still actively in that stage
  const byStage = {};
  for (const s of columns) byStage[s.id] = [];
  for (const c of activeCandidates) {
    if (c.pending_next_stage_id && byStage[c.pending_next_stage_id]) {
      byStage[c.pending_next_stage_id].push({ ...c, _isPending: true });
    } else if (byStage[c.stage_id]) {
      byStage[c.stage_id].push(c);
    }
  }

  // Summary counts (exclude terminal candidates from active/overdue tallies)
  const nonTerminal  = activeCandidates.filter(c => !c.is_terminal);
  const totalActive  = nonTerminal.length;
  const totalOverdue = nonTerminal.filter(
    c => c.next_step_due && c.next_step_due < today
  ).length;

  const openReqs = reqs.filter(r => r.status !== 'closed' && r.status !== 'filled');

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Header ── */}
      <div className="px-8 pt-8 pb-4 shrink-0">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Board</h1>
            <p className="text-slate-400 text-sm mt-0.5">
              Drag cards between stages · click to edit
            </p>
          </div>

          {/* Stats + filter */}
          <div className="flex items-center gap-4 flex-wrap">
            {/* Summary pills */}
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-slate-100 text-slate-600 text-xs font-medium rounded-full">
                {totalActive} active
              </span>
              {totalOverdue > 0 && (
                <span className="px-3 py-1 bg-red-100 text-red-700 text-xs font-semibold rounded-full">
                  🚨 {totalOverdue} overdue
                </span>
              )}
            </div>

            {/* Req filter */}
            {openReqs.length > 0 && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-500 font-medium whitespace-nowrap">Req:</label>
                <select
                  value={reqFilter}
                  onChange={e => setReqFilter(e.target.value)}
                  className={`text-sm rounded-lg px-3 py-1.5 border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    reqFilter
                      ? 'border-blue-400 bg-blue-50 text-blue-800 font-medium'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  <option value="">All candidates</option>
                  {openReqs.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.req_id} · {r.title}
                    </option>
                  ))}
                </select>
                {reqFilter && (
                  <button
                    onClick={() => setReqFilter('')}
                    className="text-xs text-slate-400 hover:text-slate-600"
                  >
                    ✕
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Kanban columns ── */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden px-8 pb-8">
        <div className="flex gap-3 h-full items-start" style={{ minWidth: 'max-content' }}>
          {columns.map(stage => (
            <KanbanColumn
              key={stage.id}
              stage={stage}
              candidates={byStage[stage.id] || []}
              today={today}
              onEdit={setEditingCandidate}
              onDragStart={handleDragStart}
              onDrop={handleDrop}
            />
          ))}

          {columns.length === 0 && (
            <div className="flex items-center justify-center w-full py-20 text-slate-400">
              <p className="text-sm">No active stages configured.</p>
            </div>
          )}
        </div>
      </div>

      {/* Subtle "moving" indicator */}
      {movingId && (
        <div className="fixed bottom-4 right-4 px-4 py-2 bg-slate-800 text-white text-xs rounded-lg shadow-lg">
          Moving…
        </div>
      )}

      {/* ── Edit modal ── */}
      {editingCandidate && (
        <CandidateModal
          candidate={editingCandidate}
          stages={stages}
          onSave={handleSave}
          onClose={() => setEditingCandidate(null)}
        />
      )}
    </div>
  );
}
