import React, { useState, useEffect } from 'react';
import { api } from '../api';

/* ── Thresholds ────────────────────────────────────────────────── */
const HM_PLUS_TARGET = 5;
const HEAVY_TOTAL    = 8;

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

/* ── Per-req card ──────────────────────────────────────────────── */
function ReqHealthCard({ req, candidates, stages, hmStage }) {
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
              {req.req_id && (
                <span className="text-xs font-mono text-slate-500 bg-white border border-slate-200 px-1.5 py-0.5 rounded shrink-0">
                  {req.req_id}
                </span>
              )}
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

          {/* Expand toggle */}
          {hmPlusCands.length > 0 && (
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
        </div>
      )}
    </div>
  );
}

/* ── Summary strip ─────────────────────────────────────────────── */
function SummaryStrip({ reqsWithStatus }) {
  const counts = { healthy: 0, warning: 0, danger: 0, critical: 0 };
  for (const { status } of reqsWithStatus) counts[status]++;

  const items = [
    { key: 'critical', label: 'All Hands',   color: 'text-red-700 bg-red-50 border-red-200'    },
    { key: 'danger',   label: 'At Risk',      color: 'text-orange-700 bg-orange-50 border-orange-200' },
    { key: 'warning',  label: 'Watch Closely',color: 'text-yellow-700 bg-yellow-50 border-yellow-200' },
    { key: 'healthy',  label: 'Healthy',      color: 'text-green-700 bg-green-50 border-green-200'  },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {items.map(({ key, label, color }) => (
        <div key={key} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold ${color}`}>
          <span className="text-lg leading-none">
            {key === 'critical' ? '🔴' : key === 'danger' ? '🚨' : key === 'warning' ? '⚠️' : '✅'}
          </span>
          <span>{counts[key]} {label}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────── */
export default function PipelineHealth() {
  const [loading,    setLoading]    = useState(true);
  const [reqs,       setReqs]       = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [stages,     setStages]     = useState([]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [r, c, s] = await Promise.all([
        api.getReqs(),
        api.getCandidates(),
        api.getStages(),
      ]);
      setReqs(Array.isArray(r) ? r : []);
      setCandidates(Array.isArray(c) ? c : []);
      setStages(Array.isArray(s) ? s : []);
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

  /* ── Compute status per req for sorting + summary strip ───────── */
  const reqsWithStatus = openReqs.map(req => {
    const cands       = candsByReq[req.id] || [];
    const hmPlusCount = cands.filter(c => hmPlusIds.has(c.stage_id)).length;
    return { req, status: getStatus(hmPlusCount) };
  });

  // Sort worst-first
  reqsWithStatus.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]);

  return (
    <div className="max-w-3xl mx-auto p-8 space-y-6">

      {/* ── Page header ────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Pipeline Health</h1>
        <p className="text-sm text-slate-500 mt-1">
          Health per open requisition — target is {HM_PLUS_TARGET}+ candidates at HM Review and beyond
        </p>
      </div>

      {/* ── Summary strip ──────────────────────────────────────────── */}
      {reqsWithStatus.length > 0 && <SummaryStrip reqsWithStatus={reqsWithStatus} />}

      {/* ── Req cards ──────────────────────────────────────────────── */}
      {reqsWithStatus.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p className="text-4xl mb-3">📋</p>
          <p className="font-medium">No open requisitions</p>
        </div>
      ) : (
        <div className="space-y-4">
          {reqsWithStatus.map(({ req }) => (
            <ReqHealthCard
              key={req.id}
              req={req}
              candidates={candsByReq[req.id] || []}
              stages={stages}
              hmStage={hmStage}
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
