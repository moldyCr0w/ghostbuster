import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  } catch { return iso; }
}

/* ── Rich candidate card for HM review ──────────────────────────── */
function HMCandidateCard({ candidate, stages, onDecision }) {
  const [expanded, setExpanded]     = useState(false);
  const [videoNotes, setVideoNotes] = useState(null); // null = not yet fetched
  const [note, setNote]             = useState('');
  const [authorName, setAuthorName] = useState('');
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [deciding, setDeciding]     = useState(null); // 'forward' | 'decline' | null

  const stage       = stages.find(s => s.id === candidate.stage_id);
  const isHmReview  = !!stage?.is_hm_review;

  // Lazy-load video notes when expanding
  const handleExpand = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && videoNotes === null) {
      const notes = await api.getVideoNotes(candidate.id);
      setVideoNotes(notes);
    }
  };

  const handleDecision = async (decision) => {
    setDeciding(decision);
    await api.hmDecision(candidate.id, decision);
    onDecision(candidate.id, decision);
    // setDeciding stays set — card will be re-rendered / removed by parent
  };

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

  return (
    <div
      className={`rounded-lg border p-4 transition-all ${
        isHmReview
          ? 'border-orange-300 bg-orange-50'
          : 'border-slate-100 bg-white'
      }`}
    >
      {/* ── Top row: name + stage badge + decision buttons ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-800 text-sm">
              {candidate.display_name || candidate.name}
            </span>
            <span
              className="px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
              style={{
                backgroundColor: (candidate.stage_color || '#94a3b8') + '20',
                color: candidate.stage_color || '#64748b',
                border: `1px solid ${(candidate.stage_color || '#94a3b8')}40`,
              }}
            >
              {candidate.stage_name}
            </span>
            {isHmReview && (
              <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-semibold rounded-full border border-orange-200">
                Awaiting Decision
              </span>
            )}
          </div>
          {candidate.email && (
            <p className="text-xs text-slate-400 mt-0.5">{candidate.email}</p>
          )}
        </div>

        {/* Forward / Decline buttons — HM Review candidates only */}
        {isHmReview && (
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => handleDecision('forward')}
              disabled={!!deciding}
              className="px-4 py-1.5 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center gap-1"
            >
              {deciding === 'forward' ? '…' : '✓ Forward'}
            </button>
            <button
              onClick={() => handleDecision('decline')}
              disabled={!!deciding}
              className="px-4 py-1.5 bg-red-500 text-white text-xs font-bold rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors flex items-center gap-1"
            >
              {deciding === 'decline' ? '…' : '✕ Decline'}
            </button>
          </div>
        )}
      </div>

      {/* ── Quick links row ── */}
      <div className="flex items-center gap-4 mt-2">
        {candidate.resume_path && (
          <a
            href={`/uploads/${candidate.resume_path}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
          >
            📄 Resume
          </a>
        )}
        {candidate.linkedin_url && (
          <a
            href={candidate.linkedin_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
          >
            🔗 LinkedIn
          </a>
        )}
        <button
          onClick={handleExpand}
          className="text-xs text-slate-400 hover:text-slate-600 ml-auto transition-colors"
        >
          {expanded ? '▲ Less' : '▼ Notes & Details'}
        </button>
      </div>

      {/* ── Expanded panel ── */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-slate-200 space-y-4">

          {/* Recruiter notes */}
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">
              Recruiter Notes
            </p>
            {candidate.notes ? (
              <pre className="text-xs text-slate-700 whitespace-pre-wrap bg-white border border-slate-100 rounded-lg p-3 font-sans leading-relaxed">
                {candidate.notes}
              </pre>
            ) : (
              <p className="text-xs text-slate-400 italic">No recruiter notes yet.</p>
            )}
          </div>

          {/* Video screen notes */}
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">
              Video Screen Notes
              {videoNotes !== null && videoNotes.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-normal normal-case tracking-normal">
                  {videoNotes.length}
                </span>
              )}
            </p>
            {videoNotes === null ? (
              <p className="text-xs text-slate-400 italic">Loading…</p>
            ) : videoNotes.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No video screen notes.</p>
            ) : (
              <div className="space-y-2">
                {videoNotes.map(vn => (
                  <div key={vn.id} className="bg-white border border-slate-100 rounded-lg p-3">
                    <p className="text-xs text-slate-400 mb-1">
                      <span className="font-medium text-slate-600">{vn.author || 'Unknown'}</span>
                      {' · '}{fmtDate(vn.created_at)}
                    </p>
                    <p className="text-xs text-slate-700 whitespace-pre-wrap">{vn.note}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add HM note */}
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">
              Add a Note
            </p>
            <form onSubmit={handleAddNote} className="space-y-2">
              <input
                value={authorName}
                onChange={e => setAuthorName(e.target.value)}
                placeholder="Your name (optional)"
                className="w-full text-xs border border-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <textarea
                rows={2}
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Add a note visible to the recruiter…"
                className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={saving || !note.trim()}
                  className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Saving…' : 'Add Note'}
                </button>
                {saved && <span className="text-xs text-green-600 font-medium">✓ Saved</span>}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Req card — pipeline bar + candidate list ───────────────────── */
function HMReqCard({ req, stages, candidates, onDecision }) {
  const [expanded, setExpanded] = useState(false);

  // Auto-expand if any candidates are awaiting HM decision
  const hmReviewStage    = stages.find(s => s.is_hm_review);
  const awaitingDecision = hmReviewStage
    ? candidates.filter(c => c.stage_id === hmReviewStage.id)
    : [];

  // Stage distribution for proportional bar
  const stageMap = {};
  for (const c of candidates) {
    stageMap[c.stage_id] = (stageMap[c.stage_id] || 0) + 1;
  }

  const activeStages   = stages.filter(s => !s.is_terminal && stageMap[s.id] > 0);
  const terminalStages = stages.filter(s =>  s.is_terminal && stageMap[s.id] > 0);
  const visibleStages  = [...activeStages, ...terminalStages];

  // Sort candidates: HM Review first, then by stage order
  const sortedCandidates = [...candidates].sort((a, b) => {
    const aIsHm = a.stage_id === hmReviewStage?.id ? 0 : 1;
    const bIsHm = b.stage_id === hmReviewStage?.id ? 0 : 1;
    if (aIsHm !== bIsHm) return aIsHm - bIsHm;
    return (a.order_index || 0) - (b.order_index || 0);
  });

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold text-slate-400">{req.req_id}</span>
            <span className="font-semibold text-slate-800 text-base">{req.title}</span>
          </div>
          {req.department && (
            <p className="text-xs text-slate-400 mt-0.5">{req.department}</p>
          )}
          {req.hiring_manager && (
            <p className="text-xs text-slate-500 mt-0.5">HM: <span className="font-medium">{req.hiring_manager}</span></p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div className="text-2xl font-bold text-slate-700 leading-none">{candidates.length}</div>
          <div className="text-xs text-slate-400 mt-0.5">candidate{candidates.length !== 1 ? 's' : ''}</div>
          {awaitingDecision.length > 0 && (
            <div className="mt-1 px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-semibold rounded-full">
              {awaitingDecision.length} pending ↓
            </div>
          )}
        </div>
      </div>

      {/* Proportional stage bar */}
      {visibleStages.length > 0 && (
        <div className="space-y-2 mb-3">
          <div className="flex gap-1">
            {visibleStages.map(s => (
              <div
                key={s.id}
                className={`flex items-center justify-center py-1.5 rounded border text-xs font-bold ${
                  s.is_terminal ? 'opacity-40' : ''
                }`}
                style={{
                  flex: stageMap[s.id] || 0,
                  minWidth: 0,
                  borderColor: s.color + '60',
                  backgroundColor: s.color + '15',
                  color: s.color,
                }}
                title={`${s.name}: ${stageMap[s.id] || 0}`}
              >
                {stageMap[s.id] || 0}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {visibleStages.map(s => (
              <div
                key={s.id}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium whitespace-nowrap ${
                  s.is_terminal ? 'opacity-40' : ''
                }`}
                style={{ borderColor: s.color + '50', backgroundColor: s.color + '12', color: '#374151' }}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                {s.name}{' '}
                <span className="font-bold" style={{ color: s.color }}>{stageMap[s.id]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Expand / collapse */}
      {candidates.length > 0 && (
        <>
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-xs text-slate-500 hover:text-slate-700 transition-colors"
          >
            {expanded ? '▲ Hide candidates' : '▼ Show candidates & notes'}
          </button>
          {expanded && (
            <div className="mt-3 border-t border-slate-100 pt-3 space-y-3">
              {sortedCandidates.map(c => (
                <HMCandidateCard
                  key={c.id}
                  candidate={c}
                  stages={stages}
                  onDecision={onDecision}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── HM View page ─────────────────────────────────────────────────── */
export default function HMView() {
  const [reqs, setReqs]             = useState([]);
  const [stages, setStages]         = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [hmFilter, setHmFilter]     = useState('');

  const load = useCallback(async () => {
    const [r, s, c] = await Promise.all([api.getReqs(), api.getStages(), api.getCandidates()]);
    setReqs(r);
    setStages(s);
    setCandidates(c);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // After an HM decision, reload everything so the candidate moves stages
  const handleDecision = useCallback(async () => {
    const [s, c] = await Promise.all([api.getStages(), api.getCandidates()]);
    setStages(s);
    setCandidates(c);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <span className="text-slate-400 text-sm">Loading…</span>
      </div>
    );
  }

  const hiringManagers = [...new Set(reqs.map(r => r.hiring_manager).filter(Boolean))].sort();

  // Only show open/active reqs
  const visibleReqs = reqs
    .filter(r => r.status !== 'closed' && r.status !== 'filled')
    .filter(r => !hmFilter || r.hiring_manager === hmFilter);

  // How many total candidates are awaiting HM decision
  const hmReviewStage    = stages.find(s => s.is_hm_review);
  const totalAwaiting    = hmReviewStage
    ? candidates.filter(c => c.stage_id === hmReviewStage.id).length
    : 0;

  // Build candidates-per-req lookup
  const candsByReq = {};
  for (const c of candidates) {
    if (c.reqs?.length > 0) {
      for (const r of c.reqs) {
        if (!candsByReq[r.id]) candsByReq[r.id] = [];
        candsByReq[r.id].push(c);
      }
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header bar */}
      <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">👻</span>
          <div>
            <h1 className="text-base font-bold leading-tight">GhostBuster</h1>
            <p className="text-slate-400 text-xs">Hiring Manager View</p>
          </div>
        </div>
        <a href="/" className="text-xs text-slate-400 hover:text-white transition-colors">
          Recruiter portal →
        </a>
      </div>

      <div className="max-w-4xl mx-auto p-8">
        {/* Page title + awaiting banner */}
        <div className="mb-6">
          <h2 className="text-xl font-bold text-slate-800">Active Pipeline</h2>
          <p className="text-slate-400 text-sm mt-0.5">
            Review candidates and click <strong>Forward</strong> or <strong>Decline</strong> for anyone awaiting your decision.
          </p>
        </div>

        {totalAwaiting > 0 && (
          <div className="mb-5 flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-xl px-5 py-3">
            <span className="text-2xl">🔍</span>
            <p className="text-sm text-orange-800 font-medium">
              <span className="font-bold">{totalAwaiting}</span>{' '}
              candidate{totalAwaiting !== 1 ? 's' : ''} awaiting your decision across your open reqs.
            </p>
          </div>
        )}

        {/* HM filter */}
        {hiringManagers.length > 0 && (
          <div className="flex items-center gap-2 mb-5">
            <label className="text-xs text-slate-500 font-medium whitespace-nowrap">Show reqs for:</label>
            <select
              value={hmFilter}
              onChange={e => setHmFilter(e.target.value)}
              className={`text-sm rounded-lg px-3 py-1.5 border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                hmFilter
                  ? 'border-blue-400 bg-blue-50 text-blue-800 font-medium'
                  : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              <option value="">All Hiring Managers</option>
              {hiringManagers.map(hm => <option key={hm} value={hm}>{hm}</option>)}
            </select>
            {hmFilter && (
              <button
                onClick={() => setHmFilter('')}
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                ✕ Clear
              </button>
            )}
          </div>
        )}

        {visibleReqs.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-sm">No active requisitions found.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {visibleReqs.map(req => (
              <HMReqCard
                key={req.id}
                req={req}
                stages={stages}
                candidates={candsByReq[req.id] || []}
                onDecision={handleDecision}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
