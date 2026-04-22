import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';

// ── Helpers ──────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return iso; }
}

function StatCard({ icon, value, label, sub, color = 'slate' }) {
  const colors = {
    blue:   'bg-blue-50 border-blue-200 text-blue-700',
    green:  'bg-emerald-50 border-emerald-200 text-emerald-700',
    orange: 'bg-orange-50 border-orange-200 text-orange-700',
    red:    'bg-red-50 border-red-200 text-red-700',
    slate:  'bg-slate-50 border-slate-200 text-slate-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
  };
  return (
    <div className={`rounded-xl border px-5 py-4 ${colors[color] || colors.slate}`}>
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-3xl font-bold leading-none mb-1">{value ?? '—'}</div>
      <div className="text-sm font-medium">{label}</div>
      {sub && <div className="text-xs opacity-60 mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Tab: Overview ────────────────────────────────────────────────

function OverviewTab({ data }) {
  const activeFunnel = (data.funnel || []).filter(s => !s.is_terminal);
  const maxCount     = Math.max(...activeFunnel.map(s => s.count), 1);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        <StatCard
          icon="⏱️"
          value={data.avgTtf != null ? `${data.avgTtf}d` : '—'}
          label="Avg Time to Fill"
          sub="From first contact to hire"
          color="blue"
        />
        <StatCard icon="🎉" value={data.totalHired} label="Total Hired" sub="All time" color="green" />
        <StatCard
          icon="✅"
          value={data.hmForwardRate != null ? `${data.hmForwardRate}%` : '—'}
          label="HM Forward Rate"
          sub={data.hmTotal ? `${data.hmTotal} total HM reviews` : 'No HM reviews yet'}
          color="orange"
        />
        <StatCard icon="📋" value={data.openReqs} label="Open Reqs" sub="Active job openings" color="slate" />
      </div>

      <div className="mb-10">
        <h2 className="text-base font-semibold text-slate-700 mb-4">Pipeline Funnel</h2>
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-3">
          {activeFunnel.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-6">No candidates in the pipeline yet.</p>
          ) : (
            activeFunnel.map(stage => (
              <div key={stage.name} className="flex items-center gap-3">
                <div className="w-36 text-xs font-medium text-slate-600 truncate shrink-0">{stage.name}</div>
                <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                  <div
                    className="h-5 rounded-full transition-all"
                    style={{
                      width: `${Math.max((stage.count / maxCount) * 100, stage.count > 0 ? 4 : 0)}%`,
                      backgroundColor: stage.color || '#6B7280',
                    }}
                  />
                </div>
                <div className="w-8 text-xs font-semibold text-slate-700 text-right shrink-0">{stage.count}</div>
              </div>
            ))
          )}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-4 mb-4">
          <h2 className="text-base font-semibold text-slate-700">HM Declined Candidates</h2>
          {data.hmTotal > 0 && (
            <span className="px-2.5 py-1 bg-red-50 border border-red-200 text-red-600 text-xs font-medium rounded-full">
              {data.hmDeclineRate}% decline rate · {data.hmDecline} of {data.hmTotal} reviews
            </span>
          )}
        </div>
        {data.declinedList.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 py-12 text-center text-slate-400 text-sm">
            No HM declines recorded yet.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">Candidate</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">Role</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">Company</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">Req</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">Date Declined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.declinedList.map(row => (
                  <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800">{row.candidate_name || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{row.role || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{row.company || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{row.req_title || '—'}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtDate(row.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

// ── Helpers ───────────────────────────────────────────────────────

const PRIORITY_META = {
  high:   { label: 'High',   color: 'bg-red-50 text-red-700 border border-red-200'         },
  medium: { label: 'Medium', color: 'bg-orange-50 text-orange-700 border border-orange-200' },
  low:    { label: 'Low',    color: 'bg-slate-100 text-slate-500'                           },
};

function PriorityBadge({ priority }) {
  if (!priority) return null;
  const meta = PRIORITY_META[priority?.toLowerCase()] || { label: priority, color: 'bg-slate-100 text-slate-500' };
  return (
    <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${meta.color}`}>
      {meta.label}
    </span>
  );
}

// ── Tab: By Requisition ──────────────────────────────────────────

function ByReqTab() {
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [statusFilter, setStatusFilter] = useState('open');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [hmFilter, setHmFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');

  useEffect(() => {
    api.getStatsByReq().then(res => {
      setData(Array.isArray(res) ? res : []);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="text-slate-400 text-sm py-12 text-center">Loading…</div>;

  // Derive unique filter options from full dataset
  const uniqueHMs   = [...new Set(data.map(r => r.hiring_manager).filter(Boolean))].sort();
  const uniqueDepts = [...new Set(data.map(r => r.department).filter(Boolean))].sort();

  // Apply all filters
  const filtered = data.filter(r => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (priorityFilter !== 'all' && (r.priority || '').toLowerCase() !== priorityFilter) return false;
    if (hmFilter   && r.hiring_manager !== hmFilter)  return false;
    if (deptFilter && r.department     !== deptFilter) return false;
    return true;
  });

  const hasActiveFilters = priorityFilter !== 'all' || hmFilter || deptFilter;

  return (
    <div>
      {/* Row 1: status pills */}
      <div className="flex gap-2 mb-3">
        {[['open', 'Open'], ['filled', 'Filled'], ['all', 'All']].map(([val, label]) => (
          <button
            key={val}
            onClick={() => setStatusFilter(val)}
            className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
              statusFilter === val
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {label}
            <span className="ml-1.5 opacity-70">
              {val === 'all' ? data.length : data.filter(r => r.status === val).length}
            </span>
          </button>
        ))}
      </div>

      {/* Row 2: Priority + HM + Department dropdowns */}
      <div className="flex flex-wrap gap-2 mb-5">
        {/* Priority */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500 font-medium">Priority</span>
          <div className="flex gap-1">
            {[['all', 'All'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setPriorityFilter(val)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  priorityFilter === val
                    ? val === 'high'   ? 'bg-red-600 text-white'
                    : val === 'medium' ? 'bg-orange-500 text-white'
                    : val === 'low'    ? 'bg-slate-500 text-white'
                    :                    'bg-slate-700 text-white'
                    : val === 'high'   ? 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
                    : val === 'medium' ? 'bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100'
                    : val === 'low'    ? 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    :                    'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Hiring Manager */}
        {uniqueHMs.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 font-medium">HM</span>
            <select
              value={hmFilter}
              onChange={e => setHmFilter(e.target.value)}
              className={`text-xs rounded-lg px-2.5 py-1.5 border transition-colors focus:outline-none focus:ring-2 focus:ring-blue-300 ${
                hmFilter
                  ? 'border-blue-400 bg-blue-50 text-blue-700 font-medium'
                  : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              <option value="">All</option>
              {uniqueHMs.map(hm => (
                <option key={hm} value={hm}>{hm}</option>
              ))}
            </select>
          </div>
        )}

        {/* Department */}
        {uniqueDepts.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 font-medium">Dept</span>
            <select
              value={deptFilter}
              onChange={e => setDeptFilter(e.target.value)}
              className={`text-xs rounded-lg px-2.5 py-1.5 border transition-colors focus:outline-none focus:ring-2 focus:ring-blue-300 ${
                deptFilter
                  ? 'border-blue-400 bg-blue-50 text-blue-700 font-medium'
                  : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              <option value="">All</option>
              {uniqueDepts.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        )}

        {/* Clear active filters */}
        {hasActiveFilters && (
          <button
            onClick={() => { setPriorityFilter('all'); setHmFilter(''); setDeptFilter(''); }}
            className="text-xs text-slate-400 hover:text-slate-600 underline ml-1 transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Results count */}
      <p className="text-xs text-slate-400 mb-4">
        Showing <span className="font-semibold text-slate-600">{filtered.length}</span> of {data.length} reqs
      </p>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 py-12 text-center text-slate-400 text-sm">
          No reqs match the selected filters.
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(req => {
            const activeStages = req.stages.filter(s => !s.is_terminal && s.count > 0);
            const hmRate = req.hmTotal > 0 ? Math.round((req.hmForward / req.hmTotal) * 100) : null;
            return (
              <div key={req.id} className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-slate-800">{req.title}</h3>
                      {req.req_ext_id && (
                        <span className="text-xs text-slate-400 font-mono">#{req.req_ext_id}</span>
                      )}
                      <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                        req.status === 'open'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-500'
                      }`}>
                        {req.status === 'open' ? 'Open' : 'Filled'}
                      </span>
                      <PriorityBadge priority={req.priority} />
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 flex-wrap">
                      {req.department && <span>{req.department}</span>}
                      {req.department && req.hiring_manager && <span>·</span>}
                      {req.hiring_manager && <span>HM: <span className="font-medium text-slate-600">{req.hiring_manager}</span></span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-2xl font-bold text-slate-800">{req.activeCandidates}</div>
                    <div className="text-xs text-slate-400">active</div>
                  </div>
                </div>

                {activeStages.length > 0 ? (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {activeStages.map(s => (
                      <div
                        key={s.stage_id}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-white"
                        style={{ backgroundColor: s.color || '#6B7280' }}
                      >
                        <span>{s.stage_name}</span>
                        <span className="bg-white/25 rounded-full px-1.5 leading-5 font-bold">{s.count}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 mb-3">No active candidates</p>
                )}

                {req.hmTotal > 0 && (
                  <div className="flex items-center gap-3 text-xs border-t border-slate-100 pt-3">
                    <span className="text-emerald-600 font-medium">✓ {req.hmForward} forwarded</span>
                    <span className="text-red-500 font-medium">✗ {req.hmDecline} declined</span>
                    {hmRate != null && <span className="text-slate-400">{hmRate}% forward rate</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Tab: By Hiring Manager ────────────────────────────────────────

function ByHmTab() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');

  useEffect(() => {
    api.getStatsByHm().then(res => {
      setData(Array.isArray(res) ? res : []);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="text-slate-400 text-sm py-12 text-center">Loading…</div>;

  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 py-12 text-center text-slate-400 text-sm">
        No hiring managers assigned to any reqs yet.
      </div>
    );
  }

  const filtered = search.trim()
    ? data.filter(hm => hm.name.toLowerCase().includes(search.trim().toLowerCase()))
    : data;

  return (
    <div>
      {/* Search */}
      <div className="mb-5">
        <input
          type="text"
          placeholder="Search hiring manager…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full max-w-xs text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300 placeholder-slate-400"
        />
        {search && (
          <span className="ml-3 text-xs text-slate-400">
            {filtered.length} of {data.length} HMs
          </span>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 py-12 text-center text-slate-400 text-sm">
          No hiring managers match "{search}".
        </div>
      ) : (
      <div className="space-y-4">
      {filtered.map(hm => (
        <div key={hm.name} className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h3 className="font-semibold text-slate-800 text-base">{hm.name}</h3>
              <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 flex-wrap">
                <span>{hm.openReqs} open {hm.openReqs === 1 ? 'req' : 'reqs'}</span>
                {hm.hmTotal > 0 && (
                  <>
                    <span>·</span>
                    <span className="text-emerald-600 font-medium">{hm.hmForwardRate}% forward rate</span>
                    <span className="text-slate-400">({hm.hmTotal} {hm.hmTotal === 1 ? 'decision' : 'decisions'})</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex gap-5 shrink-0 text-center">
              <div>
                <div className="text-2xl font-bold text-slate-800">{hm.totalActive}</div>
                <div className="text-xs text-slate-400">active</div>
              </div>
              {hm.awaitingReview > 0 && (
                <div>
                  <div className="text-2xl font-bold text-orange-500">{hm.awaitingReview}</div>
                  <div className="text-xs text-slate-400">to review</div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2 border-t border-slate-100 pt-3">
            {hm.reqs
              .filter(r => r.activeCandidates > 0 || r.status === 'open')
              .map(req => {
                const activeStages = req.stages.filter(s => !s.is_terminal && s.count > 0);
                return (
                  <div key={req.id} className="flex items-center gap-2 flex-wrap text-xs">
                    <span className={`font-medium ${
                      req.status === 'open' ? 'text-slate-700' : 'text-slate-400 line-through'
                    }`}>
                      {req.title}
                    </span>
                    {activeStages.map(s => (
                      <span
                        key={s.stage_id}
                        className="px-2 py-0.5 rounded-full text-white font-medium"
                        style={{ backgroundColor: s.color || '#6B7280' }}
                      >
                        {s.stage_name}: {s.count}
                      </span>
                    ))}
                    {activeStages.length === 0 && (
                      <span className="text-slate-400">No active candidates</span>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      ))}
      </div>
      )}
    </div>
  );
}

// ── Tab: Daily Snapshot ──────────────────────────────────────────

const DIVIDER = '────────────────────────────────────';

function stageEmoji(name = '') {
  const n = name.toLowerCase();
  if (/appli|new|sourc|inbound/.test(n))            return '📥';
  if (/phone|screen|recruiter/.test(n))              return '📞';
  if (/hm|hiring.?manager|review/.test(n))           return '👔';
  if (/interview|technical|onsite|panel/.test(n))    return '🗣️';
  if (/assess|take.?home|coding|test/.test(n))       return '💻';
  if (/offer/.test(n))                               return '🎯';
  if (/background|bg.?check|reference|ref/.test(n))  return '🔍';
  if (/hired|accepted|started/.test(n))              return '🎉';
  return '🔵';
}

function miniBar(count, max, width = 10) {
  const filled = max > 0 ? Math.round((count / max) * width) : 0;
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function generateSlackSnapshot(byReqData, overallStats) {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
  const openReqs    = byReqData.filter(r => r.status === 'open');
  const totalActive = openReqs.reduce((n, r) => n + r.activeCandidates, 0);

  const lines = [];
  lines.push(`*📊 Daily TA Update — ${today}*`);
  lines.push(DIVIDER);
  lines.push('');

  if (openReqs.length === 0) {
    lines.push('No open requisitions at this time.');
  } else {
    lines.push(
      `*Open Pipeline:* ${openReqs.length} open ${openReqs.length === 1 ? 'req' : 'reqs'} · ` +
      `${totalActive} active ${totalActive === 1 ? 'candidate' : 'candidates'}`
    );
    lines.push('');
    lines.push('*📂 Role Breakdown*');
    lines.push('');

    openReqs.forEach(req => {
      const activeStages = req.stages.filter(s => !s.is_terminal && s.count > 0);
      const meta = [
        req.department,
        req.hiring_manager ? `HM: ${req.hiring_manager}` : null,
      ].filter(Boolean).join(' | ');

      lines.push(`*${req.title}*${meta ? ` _(${meta})_` : ''}`);
      if (activeStages.length > 0) {
        const stageStr = activeStages
          .map(s => `${stageEmoji(s.stage_name)} ${s.stage_name}: ${s.count}`)
          .join('  ·  ');
        lines.push(`  ${stageStr}  · *${req.activeCandidates} active*`);
      } else {
        lines.push('  _No active candidates_');
      }
      lines.push('');
    });
  }

  // Mini bar chart from overall funnel
  const activeFunnel = (overallStats.funnel || []).filter(s => !s.is_terminal && s.count > 0);
  if (activeFunnel.length > 0) {
    lines.push(DIVIDER);
    lines.push('');
    lines.push('*📈 Pipeline Funnel*');
    const maxCount = Math.max(...activeFunnel.map(s => s.count));
    activeFunnel.forEach(stage => {
      const emoji = stageEmoji(stage.name);
      const bar   = miniBar(stage.count, maxCount);
      const label = stage.name.padEnd(18, ' ');
      lines.push(`  ${emoji} \`${label}\` ${bar}  ${stage.count}`);
    });
    lines.push('');
  }

  lines.push(DIVIDER);
  lines.push('');
  lines.push('*Key Metrics*');
  if (overallStats.avgTtf != null)        lines.push(`  ⏱️ Avg Time to Fill: *${overallStats.avgTtf} days*`);
  if (overallStats.totalHired)            lines.push(`  🎉 Total Hired (all time): *${overallStats.totalHired}*`);
  if (overallStats.hmForwardRate != null) lines.push(`  ✅ HM Forward Rate: *${overallStats.hmForwardRate}%* (${overallStats.hmTotal} reviews)`);
  lines.push(`  📋 Open Reqs: *${overallStats.openReqs}*`);
  lines.push('');
  lines.push('_Generated via GhostBuster_');

  return lines.join('\n');
}

function DailySnapshotTab({ overallStats }) {
  const [loading, setLoading] = useState(true);
  const [text, setText]       = useState('');
  const [copied, setCopied]   = useState(false);

  const loadAndGenerate = useCallback(async () => {
    setLoading(true);
    const res  = await api.getStatsByReq();
    const data = Array.isArray(res) ? res : [];
    setText(generateSlackSnapshot(data, overallStats));
    setLoading(false);
  }, [overallStats]);

  useEffect(() => { loadAndGenerate(); }, [loadAndGenerate]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return <div className="text-slate-400 text-sm py-12 text-center">Generating snapshot…</div>;
  }

  const lineCount = text.split('\n').length;

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-700">Daily Snapshot</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Slack-formatted daily TA update. Edit freely before copying.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={loadAndGenerate}
            className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            ↺ Regenerate
          </button>
          <button
            onClick={handleCopy}
            className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              copied ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {copied ? '✓ Copied!' : 'Copy to Clipboard'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-red-400 inline-block" />
          <span className="w-3 h-3 rounded-full bg-yellow-400 inline-block" />
          <span className="w-3 h-3 rounded-full bg-green-400 inline-block" />
          <span className="ml-2 text-xs font-medium text-slate-500">Slack message preview</span>
          <span className="text-xs text-slate-400">· Paste directly into any channel</span>
        </div>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          className="w-full p-5 text-sm font-mono text-slate-700 leading-relaxed resize-none focus:outline-none"
          rows={Math.max(lineCount + 3, 22)}
          spellCheck={false}
        />
      </div>

      <p className="text-xs text-slate-400 mt-3">
        Tip: <code className="bg-slate-100 px-1 rounded">*bold*</code>,{' '}
        <code className="bg-slate-100 px-1 rounded">_italic_</code>, and bullet points render natively in Slack.
      </p>
    </div>
  );
}

// ── Main Stats component ─────────────────────────────────────────

const TABS = [
  { id: 'overview',  label: 'Overview',          icon: '📈' },
  { id: 'by-req',    label: 'By Requisition',    icon: '📋' },
  { id: 'by-hm',     label: 'By Hiring Manager', icon: '👤' },
  { id: 'snapshot',  label: 'Daily Snapshot',    icon: '📣' },
];

export default function Stats() {
  const [tab, setTab]         = useState('overview');
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const load = useCallback(async () => {
    const res = await api.getStats();
    if (res?.error) { setError(res.error); setLoading(false); return; }
    setData(res);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-slate-400 text-sm">Loading stats…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-red-500 text-sm">{error}</span>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Stats</h1>
        <p className="text-slate-400 text-sm mt-0.5">Pipeline health and hiring metrics</p>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 mb-8 bg-slate-100 p-1 rounded-xl w-fit">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab data={data} />}
      {tab === 'by-req'   && <ByReqTab />}
      {tab === 'by-hm'    && <ByHmTab />}
      {tab === 'snapshot' && <DailySnapshotTab overallStats={data} />}
    </div>
  );
}
