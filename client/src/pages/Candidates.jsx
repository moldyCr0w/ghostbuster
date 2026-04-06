import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { daysUntil, relativeLabel, slaInfo } from '../utils/dates';
import CandidateModal from '../components/CandidateModal';

function DateCell({ dateStr }) {
  const d = daysUntil(dateStr);
  if (!dateStr) return <span className="text-slate-300">—</span>;
  const cls =
    d < 0  ? 'text-red-600 font-medium' :
    d === 0 ? 'text-orange-600 font-medium' :
    d <= 7  ? 'text-amber-600' : 'text-slate-600';
  return <span className={cls}>{relativeLabel(dateStr)}</span>;
}

export default function Candidates() {
  const [candidates, setCandidates] = useState([]);
  const [stages, setStages]         = useState([]);
  const [filter, setFilter]         = useState('all');
  const [search, setSearch]         = useState('');
  const [modal, setModal]           = useState(false);
  const [editing, setEditing]       = useState(null);
  const [loading, setLoading]       = useState(true);

  const load = useCallback(async () => {
    const [cands, stgs] = await Promise.all([api.getCandidates(), api.getStages()]);
    setCandidates(cands);
    setStages(stgs);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const q = search.trim().toLowerCase();
  const visible = candidates
    .filter(c => filter === 'all' || c.stage_id === Number(filter))
    .filter(c => {
      if (!q) return true;
      return (
        (c.display_name || c.first_name || c.name || '').toLowerCase().includes(q) ||
        (c.email   || '').toLowerCase().includes(q) ||
        (c.role    || '').toLowerCase().includes(q) ||
        (c.company || '').toLowerCase().includes(q)
      );
    });

  const openAdd  = () => { setEditing(null); setModal(true); };
  const openEdit = (c) => { setEditing(c);  setModal(true); };

  const handleDelete = async (c) => {
    const name = c.display_name || c.first_name || c.name || 'this candidate';
    if (!window.confirm(`Remove ${name} from the funnel?`)) return;
    await api.deleteCandidate(c.id);
    load();
  };

  const handleSave = async (payload) => {
    const { _resumeFile, _removeResume, _skipSave, ...data } = payload;

    if (!_skipSave) {
      let candidateId;
      if (editing) {
        await api.updateCandidate(editing.id, data);
        candidateId = editing.id;
      } else {
        const result = await api.createCandidate(data);
        candidateId = result.id;
      }

      // Handle resume after we have a confirmed candidate ID
      if (_removeResume) {
        await api.deleteResume(candidateId);
      } else if (_resumeFile) {
        await api.uploadResume(candidateId, _resumeFile);
      }
    }

    setModal(false);
    load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-slate-400 text-sm">Loading…</span>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Candidates</h1>
          <p className="text-slate-400 text-sm mt-0.5">{candidates.length} total</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <span className="text-base leading-none">+</span> Add Candidate
        </button>
      </div>

      {/* Search bar */}
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, role, company, or email…"
          className="w-full max-w-md border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        />
      </div>

      {/* Stage filter tabs */}
      <div className="flex flex-wrap gap-2 mb-5">
        <FilterBtn
          label={`All (${candidates.length})`}
          active={filter === 'all'}
          onClick={() => setFilter('all')}
        />
        {stages.map(s => (
          <FilterBtn
            key={s.id}
            label={`${s.name} (${candidates.filter(c => c.stage_id === s.id).length})`}
            active={filter === String(s.id)}
            onClick={() => setFilter(String(s.id))}
            color={filter === String(s.id) ? s.color : undefined}
          />
        ))}
      </div>

      {/* Table */}
      {visible.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <div className="text-4xl mb-3">👥</div>
          <p className="text-sm">{q ? `No candidates match "${search}".` : 'No candidates here yet.'}</p>
          {filter === 'all' && !q && (
            <button onClick={openAdd} className="mt-4 text-blue-600 text-sm hover:underline">
              Add your first candidate →
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">Stage</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">Reqs</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">Contact By</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">SLA</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map(c => (
                <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">
                      {c.display_name || c.first_name || c.name}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {c.email && (
                        <span className="text-slate-400 text-xs">{c.email}</span>
                      )}
                      {c.linkedin_url && (
                        <a
                          href={c.linkedin_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="LinkedIn Profile"
                          className="text-blue-500 hover:text-blue-700 text-xs leading-none"
                          onClick={e => e.stopPropagation()}
                        >
                          <LinkedInIcon />
                        </a>
                      )}
                      {c.wd_url && (
                        <a
                          href={c.wd_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Workday Profile"
                          className="text-emerald-600 hover:text-emerald-800 text-xs leading-none"
                          onClick={e => e.stopPropagation()}
                        >
                          <WorkdayIcon />
                        </a>
                      )}
                      {c.resume_path && (
                        <a
                          href={`/api/candidates/${c.id}/resume`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={c.resume_original_name || 'Resume'}
                          className="text-slate-500 hover:text-slate-800 text-xs leading-none"
                          onClick={e => e.stopPropagation()}
                        >
                          📄
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="px-2 py-1 rounded-full text-xs font-medium text-white whitespace-nowrap"
                      style={{ backgroundColor: c.stage_color }}
                    >
                      {c.stage_name}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {c.reqs && c.reqs.length > 0
                        ? c.reqs.map(r => (
                            <span key={r.id} className="px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded text-xs font-mono whitespace-nowrap">
                              {r.req_id}
                            </span>
                          ))
                        : <span className="text-slate-300 text-xs">—</span>
                      }
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <DateCell dateStr={c.next_step_due} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <SlaCell candidate={c} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => openEdit(c)}
                        className="px-3 py-1 text-xs font-medium bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(c)}
                        className="px-3 py-1 text-xs font-medium text-red-500 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <CandidateModal
          candidate={editing}
          stages={stages}
          onSave={handleSave}
          onClose={() => setModal(false)}
        />
      )}
    </div>
  );
}

function SlaCell({ candidate }) {
  const info = slaInfo(candidate);
  if (!info) return <span className="text-slate-300 text-xs">—</span>;
  const { bizDaysLeft, breached, isEoW } = info;
  const cls = breached
    ? 'text-red-600 font-semibold'
    : bizDaysLeft <= 1
      ? 'text-orange-600 font-medium'
      : bizDaysLeft <= 2
        ? 'text-amber-600'
        : 'text-slate-500';
  const label = breached
    ? `${Math.abs(bizDaysLeft)}d over`
    : `${bizDaysLeft}d${isEoW ? ' (EoW)' : ''}`;
  return <span className={`text-xs ${cls}`}>{label}</span>;
}

function FilterBtn({ label, active, onClick, color }) {
  const cls = active && !color
    ? 'px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-white'
    : active
      ? 'px-3 py-1.5 rounded-lg text-xs font-medium text-white'
      : 'px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-slate-200 text-slate-600 hover:bg-slate-50';
  return (
    <button
      onClick={onClick}
      className={cls}
      style={active && color ? { backgroundColor: color } : undefined}
    >
      {label}
    </button>
  );
}

function LinkedInIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  );
}

function WorkdayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 110-16 8 8 0 010 16zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
    </svg>
  );
}
