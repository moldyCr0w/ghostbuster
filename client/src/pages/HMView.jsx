import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api';

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  } catch { return iso; }
}

/* ── Stat card ─────────────────────────────────────────────────── */
function HMStatCard({ icon, value, label, color = 'slate' }) {
  const colors = {
    orange: 'bg-orange-50 border-orange-200 text-orange-700',
    green:  'bg-emerald-50 border-emerald-200 text-emerald-700',
    blue:   'bg-blue-50 border-blue-200 text-blue-700',
    slate:  'bg-slate-50 border-slate-200 text-slate-700',
  };
  return (
    <div className={`rounded-xl border px-5 py-4 ${colors[color] || colors.slate}`}>
      <div className="flex items-center gap-3">
        <span className="text-2xl">{icon}</span>
        <div>
          <div className="text-2xl font-bold leading-none">{value}</div>
          <div className="text-xs font-medium mt-1 opacity-70">{label}</div>
        </div>
      </div>
    </div>
  );
}

/* ── Action card — hero decision card in the queue ─────────────── */
function HMActionCard({ candidate, req, onDecision, onViewDetails }) {
  const [deciding, setDeciding] = useState(null);

  const handleDecision = async (decision) => {
    setDeciding(decision);
    await api.hmDecision(candidate.id, decision);
    onDecision(candidate.id, decision);
  };

  const notesPreview = candidate.notes
    ? candidate.notes.length > 120
      ? candidate.notes.slice(0, 120) + '…'
      : candidate.notes
    : null;

  return (
    <div className="bg-white rounded-xl border-2 border-orange-200 shadow-sm p-5 w-80 shrink-0 flex flex-col">
      {/* Candidate info */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="font-semibold text-slate-800 text-sm leading-tight">
            {candidate.display_name || candidate.name}
          </p>
          {candidate.email && (
            <p className="text-xs text-slate-400 mt-0.5 truncate">{candidate.email}</p>
          )}
        </div>
        <button
          onClick={() => onViewDetails(candidate)}
          className="text-xs text-slate-400 hover:text-blue-600 shrink-0 transition-colors"
          title="View details"
        >
          Details &rarr;
        </button>
      </div>

      {/* Req badge */}
      {req && (
        <div className="flex items-center gap-2 mb-3">
          <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded font-mono">
            {req.req_id}
          </span>
          <span className="text-xs text-slate-500 truncate">{req.title}</span>
        </div>
      )}

      {/* Notes preview */}
      {notesPreview && (
        <div className="bg-slate-50 rounded-lg p-3 mb-3 flex-1">
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-1">Recruiter Notes</p>
          <p className="text-xs text-slate-600 leading-relaxed">{notesPreview}</p>
        </div>
      )}
      {!notesPreview && <div className="flex-1" />}

      {/* Quick links */}
      <div className="flex items-center gap-3 mb-4">
        {candidate.resume_path && (
          <a
            href={`/api/candidates/${candidate.id}/resume`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            Resume
          </a>
        )}
        {candidate.linkedin_url && (
          <a
            href={candidate.linkedin_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            LinkedIn
          </a>
        )}
      </div>

      {/* Decision buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => handleDecision('forward')}
          disabled={!!deciding}
          className="flex-1 px-4 py-2.5 bg-emerald-600 text-white text-sm font-bold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          {deciding === 'forward' ? 'Forwarding…' : 'Forward'}
        </button>
        <button
          onClick={() => handleDecision('decline')}
          disabled={!!deciding}
          className="flex-1 px-4 py-2.5 bg-red-500 text-white text-sm font-bold rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors"
        >
          {deciding === 'decline' ? 'Declining…' : 'Decline'}
        </button>
      </div>
    </div>
  );
}

/* ── Kanban card — compact card in the board columns ───────────── */
function HMKanbanCard({ candidate, stage, onDecision, onClick }) {
  const [deciding, setDeciding] = useState(null);
  const isHmReview = !!stage?.is_hm_review;

  const handleDecision = async (e, decision) => {
    e.stopPropagation();
    setDeciding(decision);
    await api.hmDecision(candidate.id, decision);
    onDecision(candidate.id, decision);
  };

  return (
    <div
      onClick={() => onClick(candidate)}
      className={`bg-white rounded-lg border p-3 cursor-pointer hover:shadow-md transition-shadow ${
        isHmReview ? 'border-l-4' : 'border-l-4'
      }`}
      style={{ borderLeftColor: stage?.color || '#94a3b8' }}
    >
      <p className="text-sm font-semibold text-slate-800 leading-tight">
        {candidate.display_name || candidate.name}
      </p>
      {candidate.email && (
        <p className="text-xs text-slate-400 mt-0.5 truncate">{candidate.email}</p>
      )}

      {/* Req badges */}
      {candidate.reqs?.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {candidate.reqs.map(r => (
            <span key={r.id} className="px-1.5 py-0.5 bg-slate-100 text-slate-500 text-xs rounded font-mono">
              {r.req_id}
            </span>
          ))}
        </div>
      )}

      {/* Quick links */}
      <div className="flex items-center gap-2 mt-1.5">
        {candidate.resume_path && (
          <a
            href={`/api/candidates/${candidate.id}/resume`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="text-xs text-blue-500 hover:text-blue-700"
          >
            Resume
          </a>
        )}
        {candidate.linkedin_url && (
          <a
            href={candidate.linkedin_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="text-xs text-blue-500 hover:text-blue-700"
          >
            LinkedIn
          </a>
        )}
      </div>

      {/* Inline decision buttons for HM Review cards */}
      {isHmReview && (
        <div className="flex gap-1.5 mt-2.5">
          <button
            onClick={e => handleDecision(e, 'forward')}
            disabled={!!deciding}
            className="flex-1 px-2 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {deciding === 'forward' ? '…' : 'Forward'}
          </button>
          <button
            onClick={e => handleDecision(e, 'decline')}
            disabled={!!deciding}
            className="flex-1 px-2 py-1.5 bg-red-500 text-white text-xs font-bold rounded hover:bg-red-600 disabled:opacity-50 transition-colors"
          >
            {deciding === 'decline' ? '…' : 'Decline'}
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Kanban column ─────────────────────────────────────────────── */
function HMKanbanColumn({ stage, candidates, onDecision, onCardClick }) {
  const isHmReview = !!stage.is_hm_review;
  const hasWaiting = isHmReview && candidates.length > 0;

  return (
    <div className="flex flex-col w-56 shrink-0">
      {/* Column header */}
      <div
        className={`flex items-center justify-between px-3 py-2 rounded-t-lg border border-b-0 ${
          hasWaiting ? 'ring-2 ring-orange-300 ring-inset' : ''
        }`}
        style={{ backgroundColor: stage.color + '18', borderColor: stage.color + '50' }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
          <span className="text-xs font-semibold text-slate-700 truncate">{stage.name}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-1">
          {hasWaiting && (
            <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
          )}
          <span
            className="text-xs font-bold px-1.5 py-0.5 rounded-full"
            style={{ backgroundColor: stage.color + '25', color: stage.color }}
          >
            {candidates.length}
          </span>
        </div>
      </div>

      {/* Card list */}
      <div
        className={`flex-1 rounded-b-lg border p-2 space-y-2 overflow-y-auto ${
          hasWaiting
            ? 'bg-orange-50/50 border-orange-200'
            : 'bg-slate-50/80 border-slate-200'
        }`}
        style={{ minHeight: 100, maxHeight: 'calc(100vh - 480px)' }}
      >
        {candidates.map(c => (
          <HMKanbanCard
            key={c.id}
            candidate={c}
            stage={stage}
            onDecision={onDecision}
            onClick={onCardClick}
          />
        ))}
        {candidates.length === 0 && (
          <div className="flex items-center justify-center h-14">
            <span className="text-xs text-slate-300 italic select-none">No candidates</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Candidate detail drawer (slide-out from right) ───────────── */
function HMCandidateDrawer({ candidate, stages, onClose, onDecision }) {
  const [videoNotes, setVideoNotes]           = useState(null);
  const [note, setNote]                       = useState('');
  const [authorName, setAuthorName]           = useState('');
  const [saving, setSaving]                   = useState(false);
  const [saved, setSaved]                     = useState(false);
  const [deciding, setDeciding]               = useState(null);
  const [scorecard, setScorecard]             = useState(null); // null=loading, []=none, [{...}]=loaded
  const [scorecardReqTitle, setScorecardReqTitle] = useState('');
  const [interviewPlan, setInterviewPlan]     = useState(null); // null=loading

  const stage = stages.find(s => s.id === candidate.stage_id);
  const isHmReview = !!stage?.is_hm_review;

  useEffect(() => {
    api.getVideoNotes(candidate.id)
      .then(data => setVideoNotes(Array.isArray(data) ? data : []))
      .catch(() => setVideoNotes([]));
  }, [candidate.id]);

  // Load interview plan for the candidate's first linked req
  useEffect(() => {
    const firstReq = candidate.reqs?.[0];
    if (!firstReq) { setInterviewPlan([]); return; }
    api.getReqInterviewPlan(firstReq.id)
      .then(data => setInterviewPlan(Array.isArray(data) ? data : []))
      .catch(() => setInterviewPlan([]));
  }, [candidate.id]);

  // Load scorecard — find the first linked req that has scores
  useEffect(() => {
    setScorecard(null);
    const reqs = candidate.reqs || [];
    if (reqs.length === 0) { setScorecard([]); return; }
    let cancelled = false;
    (async () => {
      for (const r of reqs) {
        const data = await api.getCandidateScores(candidate.id, r.id).catch(() => []);
        if (cancelled) return;
        const scored = Array.isArray(data) ? data.filter(d => d.score != null) : [];
        if (scored.length > 0) {
          setScorecard(scored);
          setScorecardReqTitle(r.title || r.req_id || '');
          return;
        }
      }
      setScorecard([]);
    })();
    return () => { cancelled = true; };
  }, [candidate.id]);

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!note.trim()) return;
    setSaving(true);
    await api.addHmNote(candidate.id, note, authorName || null);
    setSaving(false);
    setNote('');
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleDecision = async (decision) => {
    setDeciding(decision);
    await api.hmDecision(candidate.id, decision);
    onDecision(candidate.id, decision);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40 transition-opacity"
        onClick={onClose}
      />
      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-2xl z-50 flex flex-col overflow-hidden animate-slide-in">
        {/* Drawer header */}
        <div className="px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-slate-800 leading-tight">
                {candidate.display_name || candidate.name}
              </h3>
              {candidate.email && (
                <p className="text-sm text-slate-400 mt-0.5">{candidate.email}</p>
              )}
              <div className="flex items-center gap-2 mt-2">
                <span
                  className="px-2.5 py-0.5 rounded-full text-xs font-medium"
                  style={{
                    backgroundColor: (stage?.color || '#94a3b8') + '20',
                    color: stage?.color || '#64748b',
                    border: `1px solid ${(stage?.color || '#94a3b8')}40`,
                  }}
                >
                  {candidate.stage_name || stage?.name}
                </span>
                {isHmReview && (
                  <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-semibold rounded-full border border-orange-200">
                    Awaiting Decision
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 text-xl leading-none p-1 transition-colors"
            >
              &times;
            </button>
          </div>

          {/* Quick links */}
          <div className="flex items-center gap-4 mt-3">
            {candidate.resume_path && (
              <a
                href={`/api/candidates/${candidate.id}/resume`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                View Resume
              </a>
            )}
            {candidate.linkedin_url && (
              <a
                href={candidate.linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                LinkedIn
              </a>
            )}
          </div>

          {/* Decision buttons in drawer header for HM Review */}
          {isHmReview && (
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => handleDecision('forward')}
                disabled={!!deciding}
                className="flex-1 px-4 py-2.5 bg-emerald-600 text-white text-sm font-bold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {deciding === 'forward' ? 'Forwarding…' : 'Forward to Next Stage'}
              </button>
              <button
                onClick={() => handleDecision('decline')}
                disabled={!!deciding}
                className="flex-1 px-4 py-2.5 bg-red-500 text-white text-sm font-bold rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                {deciding === 'decline' ? 'Declining…' : 'Decline'}
              </button>
            </div>
          )}
        </div>

        {/* Drawer body — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Req associations */}
          {candidate.reqs?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">Requisitions</p>
              <div className="flex flex-wrap gap-2">
                {candidate.reqs.map(r => (
                  <span key={r.id} className="px-2.5 py-1 bg-slate-100 text-slate-600 text-xs rounded-lg font-mono">
                    {r.req_id}{r.title ? ` · ${r.title}` : ''}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Video screen notes — shown first so it's visible without scrolling */}
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">
              Video Screen Notes
              {videoNotes !== null && videoNotes.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-normal normal-case tracking-normal">
                  {videoNotes.length}
                </span>
              )}
            </p>
            {videoNotes === null ? (
              <p className="text-sm text-slate-400 italic">Loading…</p>
            ) : videoNotes.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No video screen notes.</p>
            ) : (
              <div className="space-y-3">
                {videoNotes.map(vn => (
                  <div key={vn.id} className="bg-purple-50 border border-purple-100 rounded-lg p-4">
                    <p className="text-xs text-slate-400 mb-1.5">
                      <span className="font-medium text-slate-600">{vn.author || 'Unknown'}</span>
                      {' · '}{fmtDate(vn.created_at)}
                    </p>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{vn.note}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recruiter notes */}
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">Recruiter Notes</p>
            {candidate.notes ? (
              <pre className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 border border-slate-100 rounded-lg p-4 font-sans leading-relaxed">
                {candidate.notes}
              </pre>
            ) : (
              <p className="text-sm text-slate-400 italic">No recruiter notes yet.</p>
            )}
          </div>

          {/* Scorecard */}
          <div>
            <div className="flex items-baseline gap-2 mb-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Scorecard</p>
              {scorecardReqTitle && (
                <span className="text-xs text-slate-400">{scorecardReqTitle}</span>
              )}
            </div>
            {scorecard === null ? (
              <p className="text-sm text-slate-400 italic">Loading…</p>
            ) : scorecard.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No scores recorded yet.</p>
            ) : (
              <div className="bg-slate-50 border border-slate-100 rounded-lg p-4 space-y-3">
                {scorecard.map(row => {
                  const score = row.score || 0;
                  const pipColor = score >= 4 ? '#10B981' : score >= 3 ? '#3B82F6' : '#F59E0B';
                  const avg = scorecard.reduce((s, r) => s + (r.score || 0), 0) / scorecard.length;
                  return (
                    <div key={row.criterion_id} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-slate-700">{row.criterion_name}</span>
                        {row.scored_by && (
                          <span className="text-xs text-slate-400 ml-1.5">· {row.scored_by}</span>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {[1,2,3,4,5].map(n => (
                          <span
                            key={n}
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: n <= score ? pipColor : '#E2E8F0' }}
                          />
                        ))}
                      </div>
                      <span className="text-xs font-semibold text-slate-600 w-4 text-right shrink-0">{score}</span>
                    </div>
                  );
                })}
                <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                  <span className="text-xs text-slate-500">Overall avg</span>
                  <span className="text-sm font-bold text-slate-700">
                    {(scorecard.reduce((s, r) => s + (r.score || 0), 0) / scorecard.length).toFixed(1)} / 5
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Interview Process */}
          {interviewPlan !== null && interviewPlan.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">Interview Process</p>
              <ol className="space-y-1.5">
                {interviewPlan.map((entry, i) => {
                  const isCurrent = entry.stage_id === candidate.stage_id;
                  return (
                    <li
                      key={entry.id}
                      className={`flex items-start gap-2.5 px-3 py-2 rounded-lg text-sm ${
                        isCurrent
                          ? 'bg-blue-50 border border-blue-200'
                          : 'bg-slate-50 border border-slate-100'
                      }`}
                    >
                      <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold mt-0.5 ${
                        isCurrent ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'
                      }`}>
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`font-medium ${isCurrent ? 'text-blue-800' : 'text-slate-700'}`}>
                            {entry.interview_name}
                          </span>
                          {isCurrent && (
                            <span className="px-1.5 py-0.5 bg-blue-600 text-white text-xs rounded-full font-semibold leading-none">
                              Current
                            </span>
                          )}
                        </div>
                        <span className={`text-xs ${isCurrent ? 'text-blue-600' : 'text-slate-400'}`}>
                          {entry.stage_name}
                          {entry.interview_type_name ? ` · ${entry.interview_type_name}` : ''}
                        </span>
                        {entry.notes && (
                          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{entry.notes}</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          {/* Add HM note */}
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">Add a Note</p>
            <form onSubmit={handleAddNote} className="space-y-2">
              <input
                value={authorName}
                onChange={e => setAuthorName(e.target.value)}
                placeholder="Your name (optional)"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <textarea
                rows={3}
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Add a note visible to the recruiter…"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={saving || !note.trim()}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Saving…' : 'Add Note'}
                </button>
                {saved && <span className="text-sm text-green-600 font-medium">Saved</span>}
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Toast notification ────────────────────────────────────────── */
function Toast({ message, type, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, [onDone]);

  const bg = type === 'forward'
    ? 'bg-emerald-700'
    : type === 'decline'
    ? 'bg-red-600'
    : 'bg-slate-800';

  return (
    <div className={`fixed bottom-6 right-6 ${bg} text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium z-50 animate-fade-up`}>
      {message}
    </div>
  );
}

/* ── Main HM View page ────────────────────────────────────────── */
export default function HMView() {
  const [reqs, setReqs]               = useState([]);
  const [stages, setStages]           = useState([]);
  const [candidates, setCandidates]   = useState([]);
  const [loading, setLoading]         = useState(true);
  const [authed, setAuthed]           = useState(null); // null=checking, true=ok
  const [hmName, setHmName]           = useState('');
  const [hmFilter, setHmFilter]       = useState('');
  const [selectedReq, setSelectedReq] = useState('all');
  const [drawerCandidate, setDrawerCandidate] = useState(null);
  const [toast, setToast]             = useState(null);
  const actionQueueRef                = useRef(null);

  // Check HM session on mount — redirect to login if not authenticated
  useEffect(() => {
    api.hmMe().then(res => {
      if (res.authenticated) {
        setAuthed(true);
        if (res.name) {
          setHmName(res.name);
          setHmFilter(res.name);
        }
      } else {
        window.location.href = '/hm/login';
      }
    }).catch(() => {
      window.location.href = '/hm/login';
    });
  }, []);

  const handleLogout = async () => {
    await api.hmLogout();
    window.location.href = '/hm/login';
  };

  const load = useCallback(async () => {
    const [r, s, c] = await Promise.all([api.getReqs(), api.getStages(), api.getCandidates()]);
    setReqs(r);
    setStages(s);
    setCandidates(c);
    setLoading(false);
  }, []);

  useEffect(() => { if (authed) load(); }, [authed, load]);

  const handleDecision = useCallback(async (candidateId, decision) => {
    setToast({
      message: decision === 'forward' ? 'Candidate forwarded to next stage' : 'Candidate declined',
      type: decision,
    });
    setDrawerCandidate(null);
    const [s, c] = await Promise.all([api.getStages(), api.getCandidates()]);
    setStages(s);
    setCandidates(c);
  }, []);

  // Still checking session — show dark splash so there's no flash of content
  if (authed === null) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-4xl animate-pulse">&#128123;</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-3 animate-pulse">&#128123;</div>
          <span className="text-slate-400 text-sm">Loading your pipeline…</span>
        </div>
      </div>
    );
  }

  const hiringManagers = [...new Set(reqs.map(r => r.hiring_manager).filter(Boolean))].sort();

  // Only open/active reqs, filtered by HM
  const visibleReqs = reqs
    .filter(r => r.status !== 'closed' && r.status !== 'filled')
    .filter(r => !hmFilter || r.hiring_manager === hmFilter);

  // Stage references
  const hmReviewStage = stages.find(s => s.is_hm_review);
  const activeStages = stages
    .filter(s => !s.is_terminal)
    .sort((a, b) => a.order_index - b.order_index);

  // Candidates per req lookup
  const candsByReq = {};
  for (const c of candidates) {
    if (c.reqs?.length > 0) {
      for (const r of c.reqs) {
        if (!candsByReq[r.id]) candsByReq[r.id] = [];
        candsByReq[r.id].push(c);
      }
    }
  }

  // All candidates awaiting HM decision (across visible reqs)
  const visibleReqIds = new Set(visibleReqs.map(r => r.id));
  const awaitingDecision = hmReviewStage
    ? candidates.filter(c =>
        c.stage_id === hmReviewStage.id &&
        c.reqs?.some(r => visibleReqIds.has(r.id))
      )
    : [];

  // Dedup awaiting candidates (a candidate might be on multiple visible reqs)
  const seenIds = new Set();
  const uniqueAwaiting = awaitingDecision.filter(c => {
    if (seenIds.has(c.id)) return false;
    seenIds.add(c.id);
    return true;
  });

  // Total active across visible reqs
  const allVisibleCandidates = new Set();
  for (const req of visibleReqs) {
    for (const c of (candsByReq[req.id] || [])) {
      allVisibleCandidates.add(c.id);
    }
  }
  const totalActive = allVisibleCandidates.size;

  // Kanban: candidates for selected req or all
  const kanbanCandidates = selectedReq === 'all'
    ? (() => {
        // Merge all visible req candidates, deduped
        const seen = new Set();
        const merged = [];
        for (const req of visibleReqs) {
          for (const c of (candsByReq[req.id] || [])) {
            if (!seen.has(c.id)) {
              seen.add(c.id);
              merged.push(c);
            }
          }
        }
        return merged;
      })()
    : (candsByReq[Number(selectedReq)] || []);

  // Non-terminal only for Kanban
  const kanbanActive = kanbanCandidates.filter(c => !c.is_terminal);

  // Build stage -> candidate list
  const byStage = {};
  for (const s of activeStages) byStage[s.id] = [];
  for (const c of kanbanActive) {
    if (byStage[c.stage_id]) byStage[c.stage_id].push(c);
  }

  // Find the first req for each awaiting candidate (for display in action cards)
  const reqForCandidate = (c) => {
    if (!c.reqs?.length) return null;
    return visibleReqs.find(r => c.reqs.some(cr => cr.id === r.id)) || null;
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* ── Header bar ── */}
      <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-2xl">&#128123;</span>
          <div>
            <h1 className="text-base font-bold leading-tight">GhostBuster</h1>
            <p className="text-slate-400 text-xs">Hiring Manager Portal</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {/* HM filter */}
          {hiringManagers.length > 0 && (
            <div className="flex items-center gap-2">
              <select
                value={hmFilter}
                onChange={e => setHmFilter(e.target.value)}
                className={`text-xs rounded-lg px-3 py-1.5 border focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                  hmFilter
                    ? 'border-blue-400 bg-blue-900/40 text-blue-200 font-medium'
                    : 'border-slate-600 bg-slate-800 text-slate-300'
                }`}
              >
                <option value="">All Hiring Managers</option>
                {hiringManagers.map(hm => <option key={hm} value={hm}>{hm}</option>)}
              </select>
              {hmFilter && (
                <button onClick={() => setHmFilter('')} className="text-xs text-slate-500 hover:text-slate-300">
                  &times;
                </button>
              )}
            </div>
          )}
          {hmName && (
            <span className="text-xs text-slate-400 hidden sm:block">
              {hmName}
            </span>
          )}
          <button
            onClick={handleLogout}
            className="text-xs text-slate-400 hover:text-white transition-colors px-2.5 py-1 rounded-lg hover:bg-slate-700 border border-transparent hover:border-slate-600"
          >
            Sign out
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-8 pt-6 shrink-0">
          {/* ── Stats row ── */}
          <div className="grid grid-cols-3 gap-4 mb-6 max-w-2xl">
            <HMStatCard
              icon="&#128276;"
              value={uniqueAwaiting.length}
              label="Awaiting Decision"
              color="orange"
            />
            <HMStatCard
              icon="&#9989;"
              value={totalActive}
              label="Active Candidates"
              color="blue"
            />
            <HMStatCard
              icon="&#128203;"
              value={visibleReqs.length}
              label={`Open Req${visibleReqs.length !== 1 ? 's' : ''}`}
              color="green"
            />
          </div>

          {/* ── Action queue ── */}
          {uniqueAwaiting.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                  Needs Your Decision
                </h2>
                <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-bold rounded-full">
                  {uniqueAwaiting.length}
                </span>
              </div>
              <div
                ref={actionQueueRef}
                className="flex gap-4 overflow-x-auto pb-2"
                style={{ scrollSnapType: 'x mandatory' }}
              >
                {uniqueAwaiting.map(c => (
                  <div key={c.id} style={{ scrollSnapAlign: 'start' }}>
                    <HMActionCard
                      candidate={c}
                      req={reqForCandidate(c)}
                      onDecision={handleDecision}
                      onViewDetails={setDrawerCandidate}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {uniqueAwaiting.length === 0 && (
            <div className="mb-6 bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4">
              <p className="text-sm text-emerald-700 font-medium">
                All caught up — no candidates awaiting your decision right now.
              </p>
            </div>
          )}

          {/* ── Req tabs ── */}
          {visibleReqs.length > 0 && (
            <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-1">
              <button
                onClick={() => setSelectedReq('all')}
                className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                  selectedReq === 'all'
                    ? 'bg-slate-800 text-white'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                All Reqs
                <span className="ml-1.5 opacity-60">({totalActive})</span>
              </button>
              {visibleReqs.map(r => {
                const count = (candsByReq[r.id] || []).filter(c => !c.is_terminal).length;
                const hasPending = hmReviewStage && (candsByReq[r.id] || []).some(c => c.stage_id === hmReviewStage.id);
                return (
                  <button
                    key={r.id}
                    onClick={() => setSelectedReq(String(r.id))}
                    className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap relative ${
                      String(selectedReq) === String(r.id)
                        ? 'bg-slate-800 text-white'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {r.req_id} &middot; {r.title}
                    <span className="ml-1.5 opacity-60">({count})</span>
                    {hasPending && (
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-orange-400 rounded-full border-2 border-slate-50" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Kanban board ── */}
        {visibleReqs.length > 0 ? (
          <div className="flex-1 overflow-x-auto overflow-y-hidden px-8 pb-6">
            <div className="flex gap-3 h-full items-start" style={{ minWidth: 'max-content' }}>
              {activeStages.map(stage => (
                <HMKanbanColumn
                  key={stage.id}
                  stage={stage}
                  candidates={byStage[stage.id] || []}
                  onDecision={handleDecision}
                  onCardClick={setDrawerCandidate}
                />
              ))}
              {activeStages.length === 0 && (
                <div className="flex items-center justify-center w-full py-16 text-slate-400">
                  <p className="text-sm">No active stages configured.</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400">
            <div className="text-center">
              <div className="text-5xl mb-3">&#128203;</div>
              <p className="text-sm">No active requisitions found.</p>
              {hmFilter && (
                <button
                  onClick={() => setHmFilter('')}
                  className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  Clear filter
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Candidate detail drawer ── */}
      {drawerCandidate && (
        <HMCandidateDrawer
          candidate={drawerCandidate}
          stages={stages}
          onClose={() => setDrawerCandidate(null)}
          onDecision={handleDecision}
        />
      )}

      {/* ── Toast ── */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDone={() => setToast(null)}
        />
      )}

      {/* ── Inline styles for animations ── */}
      <style>{`
        @keyframes slide-in {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in {
          animation: slide-in 0.25s ease-out;
        }
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-up {
          animation: fade-up 0.2s ease-out;
        }
      `}</style>
    </div>
  );
}
