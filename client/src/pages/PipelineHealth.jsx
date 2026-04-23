import React, { useState, useEffect } from 'react';
import { api } from '../api';

/* ── Thresholds ────────────────────────────────────────────────── */
const HM_PLUS_TARGET = 5;
const HEAVY_TOTAL    = 8;

/* ── Priority config ───────────────────────────────────────────── */
const PRIORITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };
const PRIORITY_CFG  = {
  critical: { label: 'P1 · Critical', badge: 'bg-red-100 text-red-700 border-red-200'         },
  high:     { label: 'P2 · High',     badge: 'bg-orange-100 text-orange-700 border-orange-200' },
  medium:   { label: 'P3 · Medium',   badge: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  low:      { label: 'P4 · Low',      badge: 'bg-slate-100 text-slate-500 border-slate-200'    },
};

/* ── Status tiers ──────────────────────────────────────────────── */
function getStatus(hmPlusCount) {
  if (hmPlusCount >= HM_PLUS_TARGET) return 'healthy';
  if (hmPlusCount >= 3)              return 'warning';
  if (hmPlusCount >= 1)              return 'danger';
  return 'critical';
}

// Lower index = worse (for sorting worst-first)
const STATUS_RANK = { critical: 0, danger: 1, warning: 2, healthy: 3 };

const STATUS_CFG = {
  healthy: {
    label:       'Healthy',
    icon:        '✅',
    borderClass: 'border-green-300',
    headerBg:    'bg-green-50',
    textClass:   'text-green-800',
    badgeClass:  'bg-green-100 text-green-700',
    barColor:    'bg-green-500',
    dotClass:    'bg-green-500',
  },
  warning: {
    label:       'Watch Closely',
    icon:        '⚠️',
    borderClass: 'border-yellow-300',
    headerBg:    'bg-yellow-50',
    textClass:   'text-yellow-800',
    badgeClass:  'bg-yellow-100 text-yellow-700',
    barColor:    'bg-yellow-400',
    dotClass:    'bg-yellow-400',
  },
  danger: {
    label:       'At Risk',
    icon:        '🚨',
    borderClass: 'border-orange-300',
    headerBg:    'bg-orange-50',
    textClass:   'text-orange-800',
    badgeClass:  'bg-orange-100 text-orange-700',
    barColor:    'bg-orange-500',
    dotClass:    'bg-orange-500',
  },
  critical: {
    label:       'All Hands On Deck',
    icon:        '🔴',
    borderClass: 'border-red-300',
    headerBg:    'bg-red-50',
    textClass:   'text-red-800',
    badgeClass:  'bg-red-100 text-red-700',
    barColor:    'bg-red-500',
    dotClass:    'bg-red-600',
  },
};

/* ── Progress bar ──────────────────────────────────────────────── */
function TargetBar({ count, barColor }) {
  const pct = Math.min((count / HM_PLUS_TARGET) * 100, 100);
  return (
    <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ── Candidate chip ────────────────────────────────────────────── */
function CandidateChip({ candidate }) {
  const isOverdue = candidate.next_step_due && new Date(candidate.next_step_due) < new Date();
  return (
    <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs ${
      isOverdue ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'
    }`}>
      <span className="font-medium text-slate-800 truncate">{candidate.name}</span>
      {isOverdue
        ? <span className="ml-auto text-red-600 font-semibold shrink-0">overdue</span>
        : candidate.next_step_due && (
          <span className="ml-auto text-slate-400 shrink-0">
            {new Date(candidate.next_step_due).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )
      }
    </div>
  );
}

/* ── Video screen pill ─────────────────────────────────────────── */
function ScreenPill({ screens }) {
  if (!screens || screens.length === 0) return null;
  const pending = screens.filter(s => !s.hm_decision).length;
  const go      = screens.filter(s => s.hm_decision === 'go').length;
  const noGo    = screens.filter(s => s.hm_decision === 'no_go').length;

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-xs font-semibold text-blue-700">
      <span>📹</span>
      <span>{screens.length} screen{screens.length !== 1 ? 's' : ''}</span>
      {go > 0 && <span className="text-green-700">· {go} go</span>}
      {noGo > 0 && <span className="text-red-700">· {noGo} no-go</span>}
      {pending > 0 && <span className="text-amber-600">· {pending} pending</span>}
    </div>
  );
}

/* ── Per-req card ──────────────────────────────────────────────── */
function ReqHealthCard({ req, candidates, stages, hmStage, screens, showScreens }) {
  const [expanded, setExpanded] = useState(false);

  const activeStages = stages.filter(s => !s.is_terminal).sort((a, b) => a.order_index - b.order_index);
  const hmPlusStages = hmStage
    ? activeStages.filter(s => s.order_index >= hmStage.order_index)
    : [];
  const preHmStages  = hmStage
    ? activeStages.filter(s => s.order_index < hmStage.order_index)
    : activeStages;

  const hmPlusIds  = new Set(hmPlusStages.map(s => s.id));
  const preHmIds   = new Set(preHmStages.map(s => s.id));
  const activeIds  = new Set(activeStages.map(s => s.id));

  const hmPlusCands  = candidates.filter(c => hmPlusIds.has(c.stage_id));
  const preHmCands   = candidates.filter(c => preHmIds.has(c.stage_id));
  const totalActive  = candidates.filter(c => activeIds.has(c.stage_id)).length;

  const hmPlusCount = hmPlusCands.length;
  const isHeavy     = totalActive > HEAVY_TOTAL;
  const status      = getStatus(hmPlusCount);
  const cfg         = STATUS_CFG[status];

  return (
    <div className={`rounded-xl border-2 overflow-hidden ${cfg.borderClass}`}>
      {/* Card header */}
      <div className={`${cfg.headerBg} px-5 py-4`}>
        <div className="flex items-start gap-3">
          <span className="text-xl mt-0.5 shrink-0">{cfg.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-slate-900 truncate">{req.title}</h3>
              {(() => {
                const p = PRIORITY_CFG[req.priority] || PRIORITY_CFG.medium;
                return (
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border shrink-0 ${p.badge}`}>
                    {p.label}
                  </span>
                );
              })()}
              <span className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${cfg.badgeClass}`}>
                {cfg.label}
              </span>
            </div>
            {req.hiring_manager && (
              <p className="text-xs text-slate-500 mt-0.5">HM: {req.hiring_manager}</p>
            )}
          </div>
        </div>

        {/* Progress bar + count */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span>HM Review & Beyond</span>
            <span className={`font-bold ${cfg.textClass}`}>{hmPlusCount} / {HM_PLUS_TARGET} target</span>
          </div>
          <TargetBar count={hmPlusCount} barColor={cfg.barColor} />
        </div>

        {/* Metric pills */}
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <div className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${cfg.badgeClass}`}>
            {hmPlusCount} at HM+
          </div>
          <div className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600">
            {preHmCands.length} pre-HM
          </div>
          <div className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${
            isHeavy ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
          }`}>
            {totalActive} total{isHeavy ? ' ⚡ heavy' : ''}
          </div>
          {showScreens && <ScreenPill screens={screens} />}

          {/* Expand toggle */}
          {(hmPlusCands.length > 0 || (screens && screens.length > 0)) && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="ml-auto text-xs text-slate-500 hover:text-slate-700 underline shrink-0"
            >
              {expanded ? 'Hide details' : 'Show details'}
            </button>
          )}
        </div>
      </div>

      {/* Expanded stage breakdown */}
      {expanded && (
        <div className="px-5 py-4 bg-white space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            HM Review & Beyond
          </p>
          <div className="space-y-3">
            {hmPlusStages.map(stage => {
              const stageCands = candidates.filter(c => c.stage_id === stage.id);
              if (stageCands.length === 0) return null;
              return (
                <div key={stage.id}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: stage.color || '#94a3b8' }} />
                    <span className="text-xs font-semibold text-slate-600">{stage.name}</span>
                    <span className="text-xs text-slate-400">({stageCands.length})</span>
                  </div>
                  <div className="space-y-1 pl-4">
                    {stageCands.map(c => <CandidateChip key={c.id} candidate={c} />)}
                  </div>
                </div>
              );
            })}
          </div>

          {preHmCands.length > 0 && (
            <>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide pt-1">
                Pre-HM (not counted)
              </p>
              <div className="space-y-3">
                {preHmStages.map(stage => {
                  const stageCands = candidates.filter(c => c.stage_id === stage.id);
                  if (stageCands.length === 0) return null;
                  return (
                    <div key={stage.id}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: stage.color || '#94a3b8' }} />
                        <span className="text-xs font-semibold text-slate-500">{stage.name}</span>
                        <span className="text-xs text-slate-400">({stageCands.length})</span>
                      </div>
                      <div className="space-y-1 pl-4">
                        {stageCands.map(c => <CandidateChip key={c.id} candidate={c} />)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {showScreens && screens && screens.length > 0 && (
            <>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide pt-1">
                📹 Video Screens
              </p>
              <div className="space-y-1.5">
                {screens.map(s => {
                  const decisionIcon = s.hm_decision === 'go' ? '✅' : s.hm_decision === 'no_go' ? '❌' : '⏳';
                  const decisionLabel = s.hm_decision === 'go' ? 'Go' : s.hm_decision === 'no_go' ? 'No Go' : 'Pending';
                  return (
                    <div key={s.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border bg-white border-slate-200 text-xs">
                      <span>{decisionIcon}</span>
                      <span className="font-medium text-slate-800 truncate">{s.candidate_name}</span>
                      <span className="ml-auto text-slate-500 shrink-0">{decisionLabel}</span>
                      {s.hm_name && <span className="text-slate-400 shrink-0">· {s.hm_name}</span>}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Summary strip (filter tabs) ──────────────────────────────── */
function SummaryStrip({ reqsWithStatus, activeFilter, onFilter }) {
  const counts = { healthy: 0, warning: 0, danger: 0, critical: 0 };
  for (const { status } of reqsWithStatus) counts[status]++;

  const items = [
    { key: 'critical', label: 'All Hands',    icon: '🔴', activeColor: 'bg-red-100 text-red-800 border-red-400 ring-2 ring-red-300',         inactiveColor: 'text-red-700 bg-red-50 border-red-200 hover:bg-red-100'         },
    { key: 'danger',   label: 'At Risk',       icon: '🚨', activeColor: 'bg-orange-100 text-orange-800 border-orange-400 ring-2 ring-orange-300', inactiveColor: 'text-orange-700 bg-orange-50 border-orange-200 hover:bg-orange-100' },
    { key: 'warning',  label: 'Watch Closely', icon: '⚠️', activeColor: 'bg-yellow-100 text-yellow-800 border-yellow-400 ring-2 ring-yellow-300', inactiveColor: 'text-yellow-700 bg-yellow-50 border-yellow-200 hover:bg-yellow-100' },
    { key: 'healthy',  label: 'Healthy',       icon: '✅', activeColor: 'bg-green-100 text-green-800 border-green-400 ring-2 ring-green-300',    inactiveColor: 'text-green-700 bg-green-50 border-green-200 hover:bg-green-100'   },
  ];

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <button
        onClick={() => onFilter(null)}
        className={`px-3 py-2 rounded-lg border text-sm font-semibold transition-colors ${
          activeFilter === null
            ? 'bg-slate-200 text-slate-900 border-slate-400 ring-2 ring-slate-300'
            : 'text-slate-600 bg-slate-50 border-slate-200 hover:bg-slate-100'
        }`}
      >
        All ({reqsWithStatus.length})
      </button>
      {items.map(({ key, label, icon, activeColor, inactiveColor }) => (
        <button
          key={key}
          onClick={() => onFilter(activeFilter === key ? null : key)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold transition-colors ${
            activeFilter === key ? activeColor : inactiveColor
          }`}
        >
          <span className="text-lg leading-none">{icon}</span>
          <span>{counts[key]} {label}</span>
        </button>
      ))}
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────── */
export default function PipelineHealth() {
  const [loading,      setLoading]      = useState(true);
  const [reqs,         setReqs]         = useState([]);
  const [candidates,   setCandidates]   = useState([]);
  const [stages,       setStages]       = useState([]);
  const [screens,      setScreens]      = useState([]);
  const [showScreens,  setShowScreens]  = useState(true);
  const [statusFilter, setStatusFilter] = useState(null); // null = All
  const [hmFilter,     setHmFilter]     = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [r, c, s, sc] = await Promise.all([
        api.getReqs(),
        api.getCandidates(),
        api.getStages(),
        api.getAllScreens().catch(() => []),
      ]);
      setReqs(Array.isArray(r) ? r : []);
      setCandidates(Array.isArray(c) ? c : []);
      setStages(Array.isArray(s) ? s : []);
      setScreens(Array.isArray(sc) ? sc : []);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return <div className="p-8 text-slate-400 text-sm animate-pulse">Loading pipeline health…</div>;
  }

  /* ── Build candidate→req lookup ───────────────────────────────── */
  const candsByReq = {};
  for (const c of candidates) {
    if (Array.isArray(c.reqs)) {
      for (const r of c.reqs) {
        if (!candsByReq[r.id]) candsByReq[r.id] = [];
        candsByReq[r.id].push(c);
      }
    }
  }

  const hmStage      = stages.find(s => s.is_hm_review);
  const activeStages = stages.filter(s => !s.is_terminal);
  const hmPlusIds    = new Set(
    hmStage ? activeStages.filter(s => s.order_index >= hmStage.order_index).map(s => s.id) : []
  );

  /* ── Only show open/active reqs ───────────────────────────────── */
  const CLOSED_STATUSES = new Set(['closed', 'filled', 'cancelled', 'on_hold']);
  const openReqs = reqs.filter(r => !CLOSED_STATUSES.has((r.status || '').toLowerCase()));

  /* ── Hiring managers for filter dropdown ──────────────────────── */
  const allHMs = [...new Set(openReqs.map(r => r.hiring_manager).filter(Boolean))].sort();

  /* ── Compute status per req for sorting + summary strip ───────── */
  const reqsWithStatus = openReqs.map(req => {
    const cands       = candsByReq[req.id] || [];
    const hmPlusCount = cands.filter(c => hmPlusIds.has(c.stage_id)).length;
    return { req, status: getStatus(hmPlusCount) };
  });

  // Sort: priority first (critical → low), then worst health within same priority
  reqsWithStatus.sort((a, b) => {
    const pDiff = (PRIORITY_RANK[a.req.priority] ?? 2) - (PRIORITY_RANK[b.req.priority] ?? 2);
    if (pDiff !== 0) return pDiff;
    return STATUS_RANK[a.status] - STATUS_RANK[b.status];
  });

  /* ── Group screens by req_id ──────────────────────────────────── */
  const screensByReq = {};
  for (const s of screens) {
    if (!screensByReq[s.req_id]) screensByReq[s.req_id] = [];
    screensByReq[s.req_id].push(s);
  }

  /* ── Apply active filters ─────────────────────────────────────── */
  const filteredReqs = reqsWithStatus.filter(({ req, status }) => {
    if (statusFilter && status !== statusFilter) return false;
    if (hmFilter && req.hiring_manager !== hmFilter) return false;
    return true;
  });

  const hasFilters = statusFilter !== null || hmFilter !== '';

  return (
    <div className="max-w-3xl mx-auto p-8 space-y-6">

      {/* ── Page header ────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Pipeline Health</h1>
        <p className="text-sm text-slate-500 mt-1">
          Health per open requisition — target is {HM_PLUS_TARGET}+ candidates at HM Review and beyond
        </p>
      </div>

      {/* ── Filters row ────────────────────────────────────────────── */}
      {reqsWithStatus.length > 0 && (
        <div className="space-y-3">
          <SummaryStrip
            reqsWithStatus={reqsWithStatus}
            activeFilter={statusFilter}
            onFilter={setStatusFilter}
          />
          <div className="flex items-center gap-3 flex-wrap">
            {screens.length > 0 && (
              <button
                onClick={() => setShowScreens(s => !s)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold transition-colors ${
                  showScreens
                    ? 'bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100'
                    : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span>📹</span>
                <span>{showScreens ? `Screens on (${screens.length})` : 'Screens off'}</span>
              </button>
            )}
            {allHMs.length > 0 && (
              <select
                value={hmFilter}
                onChange={e => setHmFilter(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Hiring Managers</option>
                {allHMs.map(hm => (
                  <option key={hm} value={hm}>{hm}</option>
                ))}
              </select>
            )}
            {hasFilters && (
              <button
                onClick={() => { setStatusFilter(null); setHmFilter(''); }}
                className="text-xs text-slate-500 hover:text-slate-700 underline"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Req cards ──────────────────────────────────────────────── */}
      {filteredReqs.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p className="text-4xl mb-3">{hasFilters ? '🔍' : '📋'}</p>
          <p className="font-medium">{hasFilters ? 'No reqs match the current filters' : 'No open requisitions'}</p>
          {hasFilters && (
            <button
              onClick={() => { setStatusFilter(null); setHmFilter(''); }}
              className="mt-3 text-sm text-blue-600 hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredReqs.map(({ req }) => (
            <ReqHealthCard
              key={req.id}
              req={req}
              candidates={candsByReq[req.id] || []}
              stages={stages}
              hmStage={hmStage}
              screens={screensByReq[req.id] || []}
              showScreens={showScreens}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Nav dot helpers (exported for App.jsx) ────────────────────── */
export function computeNavHealth(candidates, stages, reqs) {
  const hmStage      = stages.find(s => s.is_hm_review);
  if (!hmStage) return null;
  const activeStages = stages.filter(s => !s.is_terminal);
  const hmPlusIds    = new Set(
    activeStages.filter(s => s.order_index >= hmStage.order_index).map(s => s.id)
  );

  // Build per-req candidate counts
  const CLOSED = new Set(['closed', 'filled', 'cancelled', 'on_hold']);
  const openReqs = Array.isArray(reqs) ? reqs.filter(r => !CLOSED.has((r.status || '').toLowerCase())) : [];

  if (openReqs.length === 0) return null;

  const candsByReq = {};
  for (const c of candidates) {
    if (Array.isArray(c.reqs)) {
      for (const r of c.reqs) {
        if (!candsByReq[r.id]) candsByReq[r.id] = [];
        candsByReq[r.id].push(c);
      }
    }
  }

  // Worst status wins
  let worst = 'healthy';
  for (const req of openReqs) {
    const cands = candsByReq[req.id] || [];
    const count = cands.filter(c => hmPlusIds.has(c.stage_id)).length;
    const s     = getStatus(count);
    if (STATUS_RANK[s] < STATUS_RANK[worst]) worst = s;
  }
  return worst;
}

export const NAV_DOT_COLORS = {
  healthy:  'bg-green-400',
  warning:  'bg-yellow-400',
  danger:   'bg-orange-500',
  critical: 'bg-red-500',
};
