import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { localToday } from '../utils/dates';
import { useAuth } from '../context/AuthContext';

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

/* ── Proportional bar segment (count only, no label) ─────────── */
function StageBarSegment({ stage, count, overdueCount, isTerminal }) {
  return (
    <div
      className={`flex items-center justify-center py-2 rounded border overflow-hidden ${
        isTerminal ? 'opacity-50' : ''
      }`}
      style={{
        flex: count,
        minWidth: 0,
        borderColor: stage.color + '60',
        backgroundColor: stage.color + '15',
      }}
      title={`${stage.name}: ${count}`}
    >
      <span
        className="text-base font-bold leading-none"
        style={{ color: isTerminal ? '#94a3b8' : stage.color }}
      >
        {count}
        {overdueCount > 0 && (
          <span className="ml-0.5 text-red-500 text-xs">!</span>
        )}
      </span>
    </div>
  );
}

/* ── Legend chip (full name, always readable) ─────────────────── */
function StageLegendChip({ stage, count, overdueCount, isTerminal }) {
  return (
    <div
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium whitespace-nowrap ${
        isTerminal ? 'opacity-50' : ''
      }`}
      style={{
        borderColor: stage.color + '50',
        backgroundColor: stage.color + '12',
        color: '#374151',
      }}
    >
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: isTerminal ? '#94a3b8' : stage.color }}
      />
      {stage.name}
      <span className="font-bold ml-0.5" style={{ color: isTerminal ? '#94a3b8' : stage.color }}>
        {count}
      </span>
      {overdueCount > 0 && (
        <span className="text-red-600 font-semibold">· {overdueCount} overdue</span>
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

      {/* Stage visualisation: proportional bar + readable legend */}
      {visibleStages.length > 0 ? (
        <div className="space-y-2">
          {/* Proportional bar — width reflects candidate count */}
          <div className="flex gap-1">
            {visibleStages.map(s => (
              <StageBarSegment
                key={s.id}
                stage={s}
                count={stageMap[s.id]?.count || 0}
                overdueCount={stageMap[s.id]?.overdueCount || 0}
                isTerminal={s.is_terminal}
              />
            ))}
          </div>
          {/* Legend — full stage names, always readable */}
          <div className="flex flex-wrap gap-1.5">
            {visibleStages.map(s => (
              <StageLegendChip
                key={s.id}
                stage={s}
                count={stageMap[s.id]?.count || 0}
                overdueCount={stageMap[s.id]?.overdueCount || 0}
                isTerminal={s.is_terminal}
              />
            ))}
          </div>
        </div>
      ) : (
        <p className="text-slate-400 text-sm italic">No candidates linked yet.</p>
      )}
    </div>
  );
}

/* ── Pipeline page ───────────────────────────────────────────── */
export default function Pipeline() {
  const { user }                    = useAuth();
  const [reqs, setReqs]             = useState([]);
  const [stages, setStages]         = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [filter, setFilter]         = useState('active'); // 'all' | 'active' | 'open'
  const [hmFilter, setHmFilter]             = useState('');
  // Pre-seed recruiter filter with the logged-in user's name (they can clear it)
  const [recruiterFilter, setRecruiterFilter] = useState(() => user?.name || '');

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

  // Unique hiring managers + recruiters (sorted, ignoring blanks)
  const hiringManagers = [...new Set(reqs.map(r => r.hiring_manager).filter(Boolean))].sort();
  const recruiters     = [...new Set(reqs.map(r => r.recruiter).filter(Boolean))].sort();

  // Filter reqs — status → HM → recruiter
  const filteredReqs = reqs
    .filter(r =>
      filter === 'open'   ? r.status === 'open' :
      filter === 'active' ? r.status !== 'closed' && r.status !== 'filled' :
      true
    )
    .filter(r => !hmFilter         || r.hiring_manager === hmFilter)
    .filter(r => !recruiterFilter  || r.recruiter      === recruiterFilter);

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

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {/* Status tabs */}
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

        {/* Person filters — pushed to the right, only shown when data exists */}
        {(hiringManagers.length > 0 || recruiters.length > 0) && (
          <div className="ml-auto flex items-center gap-3">

            {hiringManagers.length > 0 && (
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-slate-400 whitespace-nowrap">Hiring Manager</label>
                <select
                  value={hmFilter}
                  onChange={e => setHmFilter(e.target.value)}
                  className={`text-xs rounded-lg px-2.5 py-1.5 border transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    hmFilter
                      ? 'border-blue-400 bg-blue-50 text-blue-800 font-medium'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  <option value="">All</option>
                  {hiringManagers.map(hm => (
                    <option key={hm} value={hm}>{hm}</option>
                  ))}
                </select>
                {hmFilter && (
                  <button
                    onClick={() => setHmFilter('')}
                    className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                    title="Clear filter"
                  >
                    ✕
                  </button>
                )}
              </div>
            )}

            {recruiters.length > 0 && (
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-slate-400 whitespace-nowrap">Recruiter</label>
                <select
                  value={recruiterFilter}
                  onChange={e => setRecruiterFilter(e.target.value)}
                  className={`text-xs rounded-lg px-2.5 py-1.5 border transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    recruiterFilter
                      ? 'border-blue-400 bg-blue-50 text-blue-800 font-medium'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  <option value="">All</option>
                  {recruiters.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                {recruiterFilter && (
                  <button
                    onClick={() => setRecruiterFilter('')}
                    className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                    title="Clear filter"
                  >
                    ✕
                  </button>
                )}
              </div>
            )}

          </div>
        )}
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
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
            {(() => {
              const stageMap = {};
              for (const c of unassigned) {
                const key = c.stage_id;
                if (!stageMap[key]) stageMap[key] = { stage: { id: c.stage_id, name: c.stage_name, color: c.stage_color, is_terminal: c.is_terminal }, count: 0 };
                stageMap[key].count++;
              }
              const entries = Object.values(stageMap);
              return (
                <>
                  <div className="flex gap-1">
                    {entries.map(({ stage, count }) => (
                      <StageBarSegment key={stage.id} stage={stage} count={count} overdueCount={0} isTerminal={stage.is_terminal} />
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {entries.map(({ stage, count }) => (
                      <StageLegendChip key={stage.id} stage={stage} count={count} overdueCount={0} isTerminal={stage.is_terminal} />
                    ))}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
