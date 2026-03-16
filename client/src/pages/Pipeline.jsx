import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { localToday } from '../utils/dates';

/* ── Status badge for a req ──────────────────────────────────── */
const STATUS_STYLES = {
  open:      'bg-green-100  text-green-800  border-green-200',
  paused:    'bg-amber-100  text-amber-800  border-amber-200',
  closed:    'bg-slate-100  text-slate-500  border-slate-200',
  filled:    'bg-blue-100   text-blue-800   border-blue-200',
};

function StatusBadge({ status }) {
  const cls = STATUS_STYLES[status] || STATUS_STYLES.open;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border capitalize ${cls}`}>
      {status}
    </span>
  );
}

/* ── Stage pill showing count ────────────────────────────────── */
function StagePill({ stage, count, overdueCount, isTerminal }) {
  return (
    <div
      className={`flex flex-col items-center px-3 py-2 rounded-lg border text-center min-w-[90px] ${
        isTerminal ? 'opacity-50' : ''
      }`}
      style={{ borderColor: stage.color + '60', backgroundColor: stage.color + '15' }}
    >
      <span
        className="text-xl font-bold leading-none"
        style={{ color: isTerminal ? '#94a3b8' : stage.color }}
      >
        {count}
      </span>
      <span className="text-xs mt-1 leading-tight text-slate-600 font-medium">{stage.name}</span>
      {overdueCount > 0 && (
        <span className="mt-1 text-xs text-red-600 font-semibold">
          {overdueCount} overdue
        </span>
      )}
    </div>
  );
}

/* ── Req pipeline card ───────────────────────────────────────── */
function ReqCard({ req, stages, candidatesForReq }) {
  const today = localToday();

  // Build a map: stage_id → { count, overdueCount }
  const stageMap = {};
  for (const c of candidatesForReq) {
    if (!stageMap[c.stage_id]) {
      stageMap[c.stage_id] = { count: 0, overdueCount: 0 };
    }
    stageMap[c.stage_id].count++;
    if (c.next_step_due && c.next_step_due < today) {
      stageMap[c.stage_id].overdueCount++;
    }
  }

  const total       = candidatesForReq.length;
  const totalOverdue = candidatesForReq.filter(
    c => c.next_step_due && c.next_step_due < today
  ).length;

  // Non-terminal stages first, then terminal ones — both only shown if count > 0
  const activeStages   = stages.filter(s => !s.is_terminal && stageMap[s.id]?.count > 0);
  const terminalStages = stages.filter(s =>  s.is_terminal && stageMap[s.id]?.count > 0);
  const visibleStages  = [...activeStages, ...terminalStages];

  return (
    <div className={`bg-white rounded-xl border p-5 ${
      totalOverdue > 0 ? 'border-red-200' : 'border-slate-200'
    }`}>
      {/* Card header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold text-slate-500">{req.req_id}</span>
            <span className="font-semibold text-slate-800 text-base truncate">{req.title}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            {req.department && (
              <span className="text-slate-400 text-xs">{req.department}</span>
            )}
            <StatusBadge status={req.status} />
            {totalOverdue > 0 && (
              <span className="text-xs text-red-600 font-semibold">
                🚨 {totalOverdue} SLA breach{totalOverdue > 1 ? 'es' : ''}
              </span>
            )}
          </div>
        </div>
        {/* Total candidate count */}
        <div className="shrink-0 text-right">
          <div className="text-2xl font-bold text-slate-700 leading-none">{total}</div>
          <div className="text-xs text-slate-400 mt-0.5">candidate{total !== 1 ? 's' : ''}</div>
        </div>
      </div>

      {/* Stage pills */}
      {visibleStages.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {visibleStages.map(s => (
            <StagePill
              key={s.id}
              stage={s}
              count={stageMap[s.id]?.count || 0}
              overdueCount={stageMap[s.id]?.overdueCount || 0}
              isTerminal={s.is_terminal}
            />
          ))}
        </div>
      ) : (
        <p className="text-slate-400 text-sm italic">No candidates linked yet.</p>
      )}
    </div>
  );
}

/* ── Pipeline page ───────────────────────────────────────────── */
export default function Pipeline() {
  const [reqs, setReqs]             = useState([]);
  const [stages, setStages]         = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [filter, setFilter]         = useState('active'); // 'all' | 'active' | 'open'

  const load = useCallback(async () => {
    const [r, s, c] = await Promise.all([
      api.getReqs(),
      api.getStages(),
      api.getCandidates(),
    ]);
    setReqs(r);
    setStages(s);
    setCandidates(c);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-slate-400 text-sm">Loading…</span>
      </div>
    );
  }

  // Compute candidates-per-req lookup
  const candsByReq = {};
  for (const c of candidates) {
    if (c.reqs && c.reqs.length > 0) {
      for (const r of c.reqs) {
        if (!candsByReq[r.id]) candsByReq[r.id] = [];
        candsByReq[r.id].push(c);
      }
    }
  }

  // Unassigned candidates (no reqs linked)
  const unassigned = candidates.filter(c => !c.reqs || c.reqs.length === 0);

  // Filter reqs
  const filteredReqs =
    filter === 'open'   ? reqs.filter(r => r.status === 'open') :
    filter === 'active' ? reqs.filter(r => r.status !== 'closed' && r.status !== 'filled') :
    reqs;

  // Summary stats
  const today       = localToday();
  const totalActive = candidates.filter(c => {
    const stage = stages.find(s => s.id === c.stage_id);
    return stage && !stage.is_terminal;
  }).length;
  const totalOverdue = candidates.filter(
    c => c.next_step_due && c.next_step_due < today
  ).length;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Pipeline</h1>
          <p className="text-slate-400 text-sm mt-0.5">Candidates per stage, by requisition</p>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3 mb-6 mt-4">
        <div className="border rounded-xl p-4 bg-white border-slate-200">
          <div className="text-2xl font-bold text-blue-600">{reqs.filter(r => r.status === 'open').length}</div>
          <div className="text-xs text-slate-500 mt-1">Open Reqs</div>
        </div>
        <div className="border rounded-xl p-4 bg-white border-slate-200">
          <div className="text-2xl font-bold text-slate-700">{totalActive}</div>
          <div className="text-xs text-slate-500 mt-1">Active Candidates</div>
        </div>
        <div className={`border rounded-xl p-4 ${totalOverdue > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
          <div className={`text-2xl font-bold ${totalOverdue > 0 ? 'text-red-600' : 'text-slate-400'}`}>
            {totalOverdue}
          </div>
          <div className="text-xs text-slate-500 mt-1">SLA Breaches</div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-5">
        {[
          { key: 'active', label: 'Active Reqs' },
          { key: 'open',   label: 'Open Only' },
          { key: 'all',    label: 'All Reqs' },
        ].map(opt => (
          <button
            key={opt.key}
            onClick={() => setFilter(opt.key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              filter === opt.key
                ? 'bg-slate-800 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Req cards */}
      {filteredReqs.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-sm">No requisitions match this filter.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredReqs.map(req => (
            <ReqCard
              key={req.id}
              req={req}
              stages={stages}
              candidatesForReq={candsByReq[req.id] || []}
            />
          ))}
        </div>
      )}

      {/* Unassigned candidates */}
      {unassigned.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
            ⚠️ Unassigned — not linked to any req ({unassigned.length})
          </h2>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex flex-wrap gap-2">
              {(() => {
                const stageMap = {};
                for (const c of unassigned) {
                  const key = c.stage_id;
                  if (!stageMap[key]) stageMap[key] = { stage: { id: c.stage_id, name: c.stage_name, color: c.stage_color, is_terminal: c.is_terminal }, count: 0 };
                  stageMap[key].count++;
                }
                return Object.values(stageMap).map(({ stage, count }) => (
                  <StagePill key={stage.id} stage={stage} count={count} overdueCount={0} isTerminal={stage.is_terminal} />
                ));
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
