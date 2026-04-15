import React, { useState, useEffect } from 'react';
import { api } from '../api';

/* ── Health thresholds ─────────────────────────────────────────── */
const HM_PLUS_TARGET   = 5;   // ideal minimum at HM Review and beyond
const HEAVY_TOTAL      = 8;   // total active candidates that triggers "heavy" flag

function getStatus(hmPlusCount) {
  if (hmPlusCount >= HM_PLUS_TARGET) return 'healthy';
  if (hmPlusCount >= 3)              return 'warning';
  if (hmPlusCount >= 1)              return 'danger';
  return 'critical';
}

const STATUS_CFG = {
  healthy: {
    label:       'Healthy',
    sublabel:    'Pipeline is in great shape',
    headerClass: 'bg-green-50 border-green-200',
    textClass:   'text-green-800',
    countClass:  'text-green-700 bg-green-100',
    dotClass:    'bg-green-500',
    icon:        '✅',
  },
  warning: {
    label:       'Watch Closely',
    sublabel:    'Below target — consider accelerating sourcing',
    headerClass: 'bg-yellow-50 border-yellow-200',
    textClass:   'text-yellow-800',
    countClass:  'text-yellow-700 bg-yellow-100',
    dotClass:    'bg-yellow-400',
    icon:        '⚠️',
  },
  danger: {
    label:       'At Risk',
    sublabel:    'Pipeline is critically thin — action needed now',
    headerClass: 'bg-orange-50 border-orange-200',
    textClass:   'text-orange-800',
    countClass:  'text-orange-700 bg-orange-100',
    dotClass:    'bg-orange-500',
    icon:        '🚨',
  },
  critical: {
    label:       'All Hands On Deck',
    sublabel:    'No active candidates past HM Review — pipeline is empty',
    headerClass: 'bg-red-50 border-red-200',
    textClass:   'text-red-800',
    countClass:  'text-red-700 bg-red-100',
    dotClass:    'bg-red-600',
    icon:        '🔴',
  },
};

/* ── Small bar showing count vs target ─────────────────────────── */
function TargetBar({ count, target }) {
  const pct = Math.min((count / target) * 100, 100);
  const color = count >= target ? 'bg-green-500' : count >= 3 ? 'bg-yellow-400' : count >= 1 ? 'bg-orange-500' : 'bg-red-500';
  return (
    <div className="mt-2 h-2 bg-slate-200 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ── Candidate chip ─────────────────────────────────────────────── */
function CandidateChip({ candidate }) {
  const isOverdue = candidate.next_step_due && new Date(candidate.next_step_due) < new Date();
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${isOverdue ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
      <span className="font-medium text-slate-800 truncate">{candidate.name}</span>
      {isOverdue && <span className="ml-auto text-xs text-red-600 font-semibold shrink-0">SLA overdue</span>}
      {candidate.next_step_due && !isOverdue && (
        <span className="ml-auto text-xs text-slate-400 shrink-0">
          Due {new Date(candidate.next_step_due).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
      )}
    </div>
  );
}

/* ── Stage column ───────────────────────────────────────────────── */
function StageSection({ stage, candidates }) {
  return (
    <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span
          className="w-3 h-3 rounded-full shrink-0"
          style={{ backgroundColor: stage.color || '#94a3b8' }}
        />
        <span className="text-sm font-semibold text-slate-700">{stage.name}</span>
        <span className="ml-auto text-xs font-bold text-slate-500 bg-slate-200 px-2 py-0.5 rounded-full">
          {candidates.length}
        </span>
      </div>
      {candidates.length === 0 ? (
        <p className="text-xs text-slate-400 italic">No candidates here</p>
      ) : (
        <div className="space-y-1.5">
          {candidates.map(c => <CandidateChip key={c.id} candidate={c} />)}
        </div>
      )}
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────────── */
export default function PipelineHealth() {
  const [loading,    setLoading]    = useState(true);
  const [candidates, setCandidates] = useState([]);
  const [stages,     setStages]     = useState([]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [cands, stgs] = await Promise.all([api.getCandidates(), api.getStages()]);
      setCandidates(Array.isArray(cands) ? cands : []);
      setStages(Array.isArray(stgs) ? stgs : []);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="p-8 text-slate-400 text-sm animate-pulse">Loading pipeline health…</div>
    );
  }

  /* ── Compute metrics ─────────────────────────────────────────── */
  const hmStage      = stages.find(s => s.is_hm_review);
  const activeStages = stages.filter(s => !s.is_terminal).sort((a, b) => a.order_index - b.order_index);

  const hmPlusStages = hmStage
    ? activeStages.filter(s => s.order_index >= hmStage.order_index)
    : [];
  const preHmStages  = hmStage
    ? activeStages.filter(s => s.order_index < hmStage.order_index)
    : activeStages;

  const hmPlusStageIds = new Set(hmPlusStages.map(s => s.id));
  const preHmStageIds  = new Set(preHmStages.map(s => s.id));

  const hmPlusCandidates   = candidates.filter(c => hmPlusStageIds.has(c.stage_id));
  const preHmCandidates    = candidates.filter(c => preHmStageIds.has(c.stage_id));
  const totalActiveCandidates = [...hmPlusCandidates, ...preHmCandidates];

  const hmPlusCount   = hmPlusCandidates.length;
  const totalCount    = totalActiveCandidates.length;
  const isHeavy       = totalCount > HEAVY_TOTAL;
  const status        = getStatus(hmPlusCount);
  const cfg           = STATUS_CFG[status];

  return (
    <div className="max-w-4xl mx-auto p-8 space-y-6">

      {/* ── Header ───────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Pipeline Health</h1>
        <p className="text-sm text-slate-500 mt-1">
          Active candidates from HM Review onward — target is {HM_PLUS_TARGET}+
        </p>
      </div>

      {/* ── Status banner ────────────────────────────────────────── */}
      <div className={`rounded-2xl border-2 p-6 ${cfg.headerClass}`}>
        <div className="flex items-start gap-4">
          <span className="text-4xl">{cfg.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-3 flex-wrap">
              <h2 className={`text-2xl font-bold ${cfg.textClass}`}>{cfg.label}</h2>
              <span className={`text-sm font-medium ${cfg.textClass} opacity-75`}>{cfg.sublabel}</span>
            </div>
            <TargetBar count={hmPlusCount} target={HM_PLUS_TARGET} />
          </div>
        </div>

        {/* Metric pills */}
        <div className="mt-5 flex flex-wrap gap-3">
          <div className={`rounded-xl px-4 py-3 ${cfg.countClass}`}>
            <p className="text-xs font-medium opacity-75 mb-0.5">HM Review & Beyond</p>
            <p className="text-3xl font-bold leading-none">{hmPlusCount}</p>
            <p className="text-xs mt-0.5 opacity-75">of {HM_PLUS_TARGET} target</p>
          </div>

          <div className="rounded-xl px-4 py-3 bg-slate-100 text-slate-700">
            <p className="text-xs font-medium opacity-75 mb-0.5">Pre-HM (informational)</p>
            <p className="text-3xl font-bold leading-none">{preHmCandidates.length}</p>
            <p className="text-xs mt-0.5 opacity-75">not counted toward target</p>
          </div>

          <div className={`rounded-xl px-4 py-3 ${isHeavy ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'}`}>
            <p className="text-xs font-medium opacity-75 mb-0.5">Total Active</p>
            <p className="text-3xl font-bold leading-none">{totalCount}</p>
            {isHeavy
              ? <p className="text-xs mt-0.5 font-semibold">Heavy load — over {HEAVY_TOTAL}</p>
              : <p className="text-xs mt-0.5 opacity-75">across all active stages</p>
            }
          </div>
        </div>

        {/* Heavy load callout */}
        {isHeavy && (
          <div className="mt-4 flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
            <span className="text-base">⚡</span>
            <p className="text-sm text-amber-800 font-medium">
              Heavy load: {totalCount} total active candidates exceeds the {HEAVY_TOTAL}-candidate threshold.
              Consider prioritizing pipeline progression to avoid backlogs.
            </p>
          </div>
        )}
      </div>

      {/* ── HM+ Stage breakdown ─────────────────────────────────── */}
      <div>
        <h3 className="text-base font-semibold text-slate-800 mb-3">Active Stages (HM Review & Beyond)</h3>
        {hmPlusStages.length === 0 ? (
          <p className="text-sm text-slate-400 italic">No HM+ stages configured.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {hmPlusStages.map(stage => (
              <StageSection
                key={stage.id}
                stage={stage}
                candidates={candidates.filter(c => c.stage_id === stage.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Pre-HM stages (informational) ───────────────────────── */}
      {preHmStages.length > 0 && (
        <div>
          <h3 className="text-base font-semibold text-slate-800 mb-1">
            Pre-HM Stages
            <span className="ml-2 text-xs font-normal text-slate-400">(not counted toward health target)</span>
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {preHmStages.map(stage => (
              <StageSection
                key={stage.id}
                stage={stage}
                candidates={candidates.filter(c => c.stage_id === stage.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Exported health-dot helper for the nav bar ─────────────────── */
export function computeNavHealth(candidates, stages) {
  const hmStage      = stages.find(s => s.is_hm_review);
  if (!hmStage) return null;
  const activeStages = stages.filter(s => !s.is_terminal);
  const hmPlusIds    = new Set(activeStages.filter(s => s.order_index >= hmStage.order_index).map(s => s.id));
  const count        = candidates.filter(c => hmPlusIds.has(c.stage_id)).length;
  return getStatus(count);
}

export const NAV_DOT_COLORS = {
  healthy:  'bg-green-400',
  warning:  'bg-yellow-400',
  danger:   'bg-orange-500',
  critical: 'bg-red-500',
};
