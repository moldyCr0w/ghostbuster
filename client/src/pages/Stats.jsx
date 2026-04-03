import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';

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

export default function Stats() {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');

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

  // Funnel — active (non-terminal) stages only
  const activeFunnel = (data.funnel || []).filter(s => !s.is_terminal);
  const maxCount     = Math.max(...activeFunnel.map(s => s.count), 1);

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Stats</h1>
        <p className="text-slate-400 text-sm mt-0.5">Pipeline health and hiring metrics</p>
      </div>

      {/* ── Top stat cards ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        <StatCard
          icon="⏱️"
          value={data.avgTtf != null ? `${data.avgTtf}d` : '—'}
          label="Avg Time to Fill"
          sub="From first contact to hire"
          color="blue"
        />
        <StatCard
          icon="🎉"
          value={data.totalHired}
          label="Total Hired"
          sub="All time"
          color="green"
        />
        <StatCard
          icon="✅"
          value={data.hmForwardRate != null ? `${data.hmForwardRate}%` : '—'}
          label="HM Forward Rate"
          sub={data.hmTotal ? `${data.hmTotal} total HM reviews` : 'No HM reviews yet'}
          color="orange"
        />
        <StatCard
          icon="📋"
          value={data.openReqs}
          label="Open Reqs"
          sub="Active job openings"
          color="slate"
        />
      </div>

      {/* ── Pipeline funnel ─────────────────────────────────────── */}
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

      {/* ── HM Declined ─────────────────────────────────────────── */}
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
    </div>
  );
}
