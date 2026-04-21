import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { localToday } from '../utils/dates';
import CandidateModal from '../components/CandidateModal';

/* ── Candidate card ──────────────────────────────────────────────── */
function CandidateCard({ candidate, today, onEdit, onDragStart, isEligible, onCardStatusChange, onConfirmScheduled, onDisposition }) {
  const isOverdue      = candidate.next_step_due && candidate.next_step_due < today;
  const isHmReview     = !!candidate.is_hm_review;
  const isPending      = !!candidate.pending_next_stage_id;
  const isRejected     = !!candidate.is_terminal && !candidate.is_hire;
  const needsDisposition = isRejected && !candidate.dispositioned_at;
  // schedule_pending is a fallback amber state for non-eligible stages with requires_scheduling
  const isSchedPending = !isEligible && !!candidate.schedule_pending;
  const subStatus      = isEligible && !isPending ? candidate.card_sub_status : null;
  const isTaAction     = subStatus === 'ta_action';
  const isChecking     = subStatus === 'check_scheduled';
  const isScheduled    = isEligible && !isPending && !subStatus;
  // Interview happened (stage_event_date is yesterday or earlier) — WD feedback now due
  const needsFeedback  = isScheduled && !!candidate.stage_event_date && candidate.stage_event_date < today;

  const [localDate, setLocalDate] = React.useState(candidate.stage_event_date || '');
  React.useEffect(() => {
    setLocalDate(candidate.stage_event_date || '');
  }, [candidate.stage_event_date]);

  const handleStatusClick = (e, newStatus, eventDate = undefined) => {
    e.stopPropagation();
    onCardStatusChange(candidate.id, newStatus, eventDate !== undefined ? eventDate : candidate.stage_event_date);
  };

  const handleDateBlur = (e) => {
    e.stopPropagation();
    onCardStatusChange(candidate.id, null, localDate || null);
  };

  return (
    <div
      draggable={!isPending && !isSchedPending}
      onDragStart={(isPending || isSchedPending) ? undefined : (e => onDragStart(e, candidate.id))}
      onClick={() => onEdit(candidate)}
      className={`rounded-lg border p-3 cursor-pointer hover:shadow-md active:opacity-70 transition-shadow select-none ${
        isPending         ? 'bg-teal-50 border-teal-400 ring-1 ring-teal-300' :
        isTaAction        ? 'bg-green-50 border-green-400' :
        isChecking        ? 'bg-yellow-50 border-yellow-400' :
        isSchedPending    ? 'bg-amber-50 border-amber-400 ring-1 ring-amber-300' :
        needsFeedback     ? 'bg-red-50 border-red-500 ring-1 ring-red-400' :
        needsDisposition  ? 'bg-red-50 border-red-400 ring-1 ring-red-300' :
        isOverdue         ? 'bg-red-50 border-red-300' :
        isHmReview        ? 'bg-orange-50 border-orange-300' :
        'bg-white border-slate-200'
      }`}
    >
      {/* Pending banner */}
      {isPending && (
        <div className="flex items-center gap-1 mb-2 px-1.5 py-0.5 bg-teal-100 rounded text-teal-700 text-xs font-semibold">
          <span>⏳</span>
          <span>Pending TA Action</span>
        </div>
      )}

      {/* TA Action banner */}
      {isTaAction && (
        <div className="flex items-center gap-1 mb-2 px-1.5 py-0.5 bg-green-100 rounded text-green-700 text-xs font-semibold">
          <span>📋</span>
          <span>TA Action Needed</span>
        </div>
      )}

      {/* Checking scheduled banner */}
      {isChecking && (
        <div className="flex items-center gap-1 mb-2 px-1.5 py-0.5 bg-yellow-100 rounded text-yellow-700 text-xs font-semibold">
          <span>⏰</span>
          <span>Awaiting Confirmation</span>
        </div>
      )}

      {/* Feedback needed banner — interview was yesterday or earlier */}
      {needsFeedback && (
        <div className="flex items-center gap-1 mb-2 px-1.5 py-0.5 bg-red-100 rounded text-red-700 text-xs font-semibold">
          <span>🔴</span>
          <span>HM / Panelist Action Needed</span>
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
              {r.title}
            </span>
          ))}
        </div>
      )}

      {/* Status tags */}
      {isSchedPending && (
        <p className="text-xs text-amber-700 font-semibold mt-1.5">📅 Pending Scheduling</p>
      )}
      {isPending && candidate.pending_reason && (
        <p className="text-xs text-teal-600 mt-1.5 italic">{candidate.pending_reason}</p>
      )}
      {!isPending && !isTaAction && !isChecking && !isSchedPending && isOverdue && (
        <p className="text-xs text-red-600 font-semibold mt-1.5">🚨 SLA overdue</p>
      )}
      {!isPending && !isSchedPending && isHmReview && !isOverdue && (
        <p className="text-xs text-orange-600 font-medium mt-1.5">🔍 Awaiting HM</p>
      )}

      {/* Confirm Scheduled button — fallback for requires_scheduling stages */}
      {isSchedPending && onConfirmScheduled && (
        <button
          onClick={e => { e.stopPropagation(); onConfirmScheduled(candidate.id); }}
          className="mt-2 w-full px-2 py-1.5 text-xs bg-green-500 text-white rounded-lg hover:bg-green-600 font-semibold transition-colors"
        >
          ✓ Confirm Scheduled
        </button>
      )}

      {/* Date field — shown when card is in "scheduled" (white) state */}
      {isScheduled && (
        <div className="mt-2" onClick={e => e.stopPropagation()}>
          <input
            type="date"
            value={localDate}
            onChange={e => setLocalDate(e.target.value)}
            onBlur={handleDateBlur}
            className="w-full text-xs border border-slate-200 rounded px-2 py-1 text-slate-600 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
      )}

      {/* Sub-status transition buttons */}
      {isTaAction && (
        <button
          onClick={e => handleStatusClick(e, 'check_scheduled', null)}
          className="mt-2 w-full text-left text-xs text-green-700 bg-green-100 hover:bg-green-200 rounded px-2 py-1 transition-colors"
        >
          → Following Up
        </button>
      )}
      {isChecking && (
        <div className="mt-2 flex gap-1" onClick={e => e.stopPropagation()}>
          <button
            onClick={e => handleStatusClick(e, 'ta_action', null)}
            className="flex-1 text-xs text-yellow-700 bg-yellow-100 hover:bg-yellow-200 rounded px-1.5 py-1 transition-colors"
          >
            ← Back
          </button>
          <button
            onClick={e => handleStatusClick(e, null, null)}
            className="flex-[2] text-xs text-white bg-red-500 hover:bg-red-600 rounded px-1.5 py-1 transition-colors font-medium"
          >
            Mark as Scheduled
          </button>
        </div>
      )}

      {/* Disposition button — shown on all Rejected/Closed cards until actioned */}
      {needsDisposition && onDisposition && (
        <button
          onClick={e => { e.stopPropagation(); onDisposition(candidate.id); }}
          className="mt-2 w-full px-2 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold transition-colors"
        >
          Dispositioned in WD?
        </button>
      )}

      {/* Post-disposition archive countdown */}
      {isRejected && candidate.dispositioned_at && (
        <p className="text-xs text-slate-400 font-medium mt-1.5">
          ✓ Dispositioned{candidate.next_step_due ? ` · archives ${candidate.next_step_due}` : ''}
        </p>
      )}

      {/* Resume indicator */}
      {candidate.resume_path && (
        <span className="inline-block mt-1.5 text-xs text-slate-400">📄</span>
      )}
    </div>
  );
}

/* ── Kanban column ───────────────────────────────────────────────── */
function KanbanColumn({ stage, candidates, today, onEdit, onDragStart, onDrop, isEligible, onCardStatusChange, onConfirmScheduled, onDisposition }) {
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
        const sub = isEligible ? c.card_sub_status : null;
        if (sub === 'ta_action')        return 0; // green  — TA action needed
        if (sub === 'check_scheduled')  return 1; // yellow — awaiting confirmation
        return 2;                                  // white  — no action
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
                isEligible={isEligible}
                onCardStatusChange={onCardStatusChange}
                onDisposition={onDisposition}
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
            isEligible={isEligible}
            onCardStatusChange={onCardStatusChange}
            onConfirmScheduled={onConfirmScheduled}
            onDisposition={onDisposition}
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
  const [stages, setStages]             = useState([]);
  const [candidates, setCandidates]     = useState([]);
  const [reqs, setReqs]                 = useState([]);
  const [users, setUsers]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [editingCandidate, setEditingCandidate] = useState(null);
  const [reqFilter, setReqFilter]       = useState('');
  const [sourcerFilter, setSourcerFilter]   = useState('');
  const [recruiterFilter, setRecruiterFilter] = useState('');
  const [movingId, setMovingId]         = useState(null); // optimistic: currently being moved

  const location   = useLocation();
  const navigate   = useNavigate();
  const handledRef = useRef(null); // prevent double-open on re-renders

  const load = useCallback(async () => {
    const [s, c, r, u] = await Promise.all([
      api.getStages(),
      api.getCandidates(),
      api.getReqs(),
      api.getUsers(),
    ]);
    setStages(s);
    setCandidates(c);
    setReqs(r);
    setUsers(u);
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

  /* ── Disposition (Rejected/Closed → mark as dispositioned in WD) ── */
  const handleDisposition = useCallback(async (id) => {
    await api.dispositionCandidate(id);
    const fresh = await api.getCandidates();
    setCandidates(fresh);
  }, []);

  /* ── Confirm scheduled (requires_scheduling stages fallback) ── */
  const handleConfirmScheduled = useCallback(async (id) => {
    await api.confirmScheduled(id);
    const fresh = await api.getCandidates();
    setCandidates(fresh);
  }, []);

  /* ── Card sub-status handler ── */
  const handleCardStatusChange = useCallback(async (candidateId, newStatus, eventDate) => {
    setCandidates(prev =>
      prev.map(x =>
        x.id === candidateId
          ? { ...x, card_sub_status: newStatus, stage_event_date: eventDate }
          : x
      )
    );
    await api.updateCardStatus(candidateId, { sub_status: newStatus, stage_event_date: eventDate });
  }, []);

  /* ── Drag handlers ── */
  const handleDragStart = useCallback((e, candidateId) => {
    e.dataTransfer.setData('candidateId', String(candidateId));
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDrop = useCallback(async (candidateId, newStageId) => {
    const c = candidates.find(x => x.id === candidateId);
    if (!c || c.stage_id === newStageId) return;

    // Optimistic update — move card visually immediately
    const newStageData  = stages.find(s => s.id === newStageId);
    const dragIsEligible = eligibleStageIds.has(newStageId);
    setMovingId(candidateId);
    setCandidates(prev =>
      prev.map(x =>
        x.id === candidateId
          ? {
              ...x,
              stage_id:         newStageId,
              stage_name:       newStageData?.name        ?? x.stage_name,
              stage_color:      newStageData?.color       ?? x.stage_color,
              order_index:      newStageData?.order_index ?? x.order_index,
              is_hm_review:     newStageData?.is_hm_review ?? 0,
              is_terminal:      newStageData?.is_terminal  ?? 0,
              card_sub_status:  dragIsEligible ? 'ta_action' : null,
              stage_event_date: null,
              schedule_pending: (!dragIsEligible && newStageData?.requires_scheduling) ? 1 : 0,
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

  // Stages eligible for 3-state sub-status: after HM Review, non-terminal, non-hire
  const hmStage = stages.find(s => s.is_hm_review);
  const eligibleStageIds = new Set(
    stages
      .filter(s => !s.is_hm_review && !s.is_terminal && !s.is_hire &&
                   hmStage && s.order_index > hmStage.order_index)
      .map(s => s.id)
  );

  // All stages except the "Hired" stage as columns, in order
  // This shows active stages + "Rejected / Closed" (declined) but hides "Hired"
  const hiredStageId = stages.find(s => s.is_hire)?.id;
  const columns = stages
    .filter(s => !(s.is_terminal && s.is_hire))
    .sort((a, b) => a.order_index - b.order_index);

  // Lookup map: req id → req (for recruiter name)
  const reqMap = Object.fromEntries(reqs.map(r => [r.id, r]));

  // Apply filters
  const visibleCandidates = candidates.filter(c => {
    if (reqFilter && !c.reqs?.some(r => String(r.id) === reqFilter)) return false;
    if (sourcerFilter && !c.reqs?.some(r => String(r.sourced_by) === sourcerFilter)) return false;
    if (recruiterFilter && !c.reqs?.some(r => reqMap[r.id]?.recruiter === recruiterFilter)) return false;
    return true;
  });

  // Exclude hired candidates, and archived rejected candidates
  // (dispositioned + their 5-day post-disposition window has expired)
  const activeCandidates = visibleCandidates.filter(c => {
    if (c.stage_id === hiredStageId) return false;
    if (c.is_terminal && !c.is_hire && c.dispositioned_at && c.next_step_due && c.next_step_due < today) return false;
    return true;
  });

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

  // Sourcer options: users who appear as sourced_by on at least one candidate's req
  const sourcerIds = new Set(
    candidates.flatMap(c => (c.reqs || []).map(r => r.sourced_by).filter(Boolean))
  );
  const sourcerOptions = users.filter(u => sourcerIds.has(u.id));

  // Recruiter options: unique recruiter names from open reqs that have one
  const recruiterOptions = [...new Set(
    openReqs.map(r => r.recruiter).filter(Boolean)
  )].sort();

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
                      {r.title}{r.total_hc > 0 ? ` (${r.open_hc}/${r.total_hc} HC open)` : ''}
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

            {/* Sourcer filter */}
            {sourcerOptions.length > 0 && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-500 font-medium whitespace-nowrap">Sourcer:</label>
                <select
                  value={sourcerFilter}
                  onChange={e => setSourcerFilter(e.target.value)}
                  className={`text-sm rounded-lg px-3 py-1.5 border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    sourcerFilter
                      ? 'border-blue-400 bg-blue-50 text-blue-800 font-medium'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  <option value="">All sourcers</option>
                  {sourcerOptions.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
                {sourcerFilter && (
                  <button
                    onClick={() => setSourcerFilter('')}
                    className="text-xs text-slate-400 hover:text-slate-600"
                  >
                    ✕
                  </button>
                )}
              </div>
            )}

            {/* Recruiter filter */}
            {recruiterOptions.length > 0 && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-500 font-medium whitespace-nowrap">Recruiter:</label>
                <select
                  value={recruiterFilter}
                  onChange={e => setRecruiterFilter(e.target.value)}
                  className={`text-sm rounded-lg px-3 py-1.5 border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    recruiterFilter
                      ? 'border-blue-400 bg-blue-50 text-blue-800 font-medium'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  <option value="">All recruiters</option>
                  {recruiterOptions.map(name => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                {recruiterFilter && (
                  <button
                    onClick={() => setRecruiterFilter('')}
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
              isEligible={eligibleStageIds.has(stage.id)}
              onCardStatusChange={handleCardStatusChange}
              onConfirmScheduled={handleConfirmScheduled}
              onDisposition={handleDisposition}
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
