import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { daysUntil, relativeLabel, localToday, calendarDaysFromToday } from '../utils/dates';
import CandidateModal from '../components/CandidateModal';

/* ── helpers for the log-activity date default ───────────────── */
function bizDateStr(n) {
  const d = new Date();
  let added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) added++;
  }
  return d.toISOString().split('T')[0];
}

/* ── Candidate card ──────────────────────────────────────────── */
function CandidateCard({ c, onEdit, onAcknowledge }) {
  const [showLog, setShowLog] = useState(false);
  const [note, setNote]       = useState('');
  const [nextDue, setNextDue] = useState('');
  const [saving, setSaving]   = useState(false);

  const openLog = () => {
    setNote('');
    setNextDue(localToday());
    setShowLog(true);
  };

  const submit = async () => {
    setSaving(true);
    await onAcknowledge(c, { note: note.trim() || undefined, next_due: nextDue || undefined });
    setSaving(false);
    setShowLog(false);
  };

  const d = daysUntil(c.next_step_due);
  const urgency =
    !c.next_step_due ? 'none'
    : d < 0  ? 'overdue'
    : d === 0 ? 'today'
    : 'soon';

  const cardBg = {
    overdue: 'border-red-200 bg-red-50',
    today:   'border-orange-200 bg-orange-50',
    soon:    'border-amber-100 bg-amber-50',
    none:    'border-slate-200 bg-slate-50',
  }[urgency];

  const dateCls = {
    overdue: 'text-red-600 font-semibold',
    today:   'text-orange-600 font-semibold',
    soon:    'text-amber-600',
    none:    'text-slate-400',
  }[urgency];

  const displayName = c.display_name || c.first_name || c.name || '(No name)';

  return (
    <div className={`border rounded-xl p-4 ${cardBg}`}>
      <div className="flex items-start justify-between gap-4">
        {/* Left: name, stage, reqs */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-800 text-sm">{displayName}</span>
            <span
              className="px-2 py-0.5 rounded-full text-xs font-medium text-white"
              style={{ backgroundColor: c.stage_color }}
            >
              {c.stage_name}
            </span>
            {/* Req badges */}
            {c.reqs && c.reqs.length > 0 && c.reqs.map(r => (
              <span
                key={r.id}
                className="px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded text-xs"
              >
                {r.title}
              </span>
            ))}
          </div>

          {/* Last activity note */}
          {c.next_step && (
            <p className="mt-1 text-xs text-slate-500 italic truncate" title={c.next_step}>
              ↳ {c.next_step}
            </p>
          )}

          {/* Profile links row */}
          {(c.email || c.linkedin_url || c.wd_url) && (
            <div className="flex items-center gap-3 mt-1.5">
              {c.email && (
                <a
                  href={`mailto:${c.email}`}
                  className="text-slate-400 hover:text-blue-600 text-xs flex items-center gap-1"
                >
                  ✉ {c.email}
                </a>
              )}
              {c.linkedin_url && (
                <a
                  href={c.linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:text-blue-700 text-xs font-medium flex items-center gap-1"
                  title="LinkedIn Profile"
                >
                  <LinkedInIcon /> LinkedIn
                </a>
              )}
              {c.wd_url && (
                <a
                  href={c.wd_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-600 hover:text-emerald-800 text-xs font-medium flex items-center gap-1"
                  title="Workday Profile"
                >
                  <WorkdayIcon /> Workday
                </a>
              )}
              {c.resume_path && (
                <a
                  href={`/api/candidates/${c.id}/resume`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-500 hover:text-slate-800 text-xs font-medium flex items-center gap-1"
                  title={c.resume_original_name || 'Resume'}
                >
                  📄 Resume
                </a>
              )}
            </div>
          )}
        </div>

        {/* Right: due date + actions */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          {c.next_step_due && (
            <span className={`text-xs whitespace-nowrap ${dateCls}`}>
              {relativeLabel(c.next_step_due)}
            </span>
          )}
          {!showLog && (
            <div className="flex items-center gap-2">
              <button
                onClick={openLog}
                className="px-2.5 py-1.5 text-xs font-medium bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 text-green-700 transition-colors"
              >
                ✓ Log Activity
              </button>
              <button
                onClick={() => onEdit(c)}
                className="px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-700 transition-colors shadow-sm"
              >
                Edit
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Inline Log Activity form ─────────────────────────── */}
      {showLog && (
        <div className="mt-3 pt-3 border-t border-slate-200 space-y-2">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              What did you do?
            </label>
            <input
              autoFocus
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setShowLog(false); }}
              placeholder={`e.g. Scheduled ${c.stage_name} for next week`}
              className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
            />
          </div>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Activity / event date
              </label>
              <input
                type="date"
                value={nextDue}
                onChange={e => setNextDue(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
              />
            </div>
            <div className="flex gap-2 pb-0.5">
              <button
                onClick={submit}
                disabled={saving}
                className="px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 disabled:opacity-60 transition-colors"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={() => setShowLog(false)}
                className="px-3 py-1.5 bg-slate-100 text-slate-600 text-xs rounded-lg hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Section ─────────────────────────────────────────────────── */
function Section({ icon, title, titleClass, candidates, onEdit, onAcknowledge }) {
  if (!candidates.length) return null;
  return (
    <section className="mb-8">
      <h2 className={`flex items-center gap-2 text-base font-semibold mb-3 ${titleClass}`}>
        {icon} {title}
        <span className="ml-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-xs font-normal">
          {candidates.length}
        </span>
      </h2>
      <div className="space-y-2">
        {candidates.map(c => (
          <CandidateCard key={c.id} c={c} onEdit={onEdit} onAcknowledge={onAcknowledge} />
        ))}
      </div>
    </section>
  );
}

/* ── Stat card ───────────────────────────────────────────────── */
function StatCard({ value, label, valueClass, bgClass }) {
  return (
    <div className={`border rounded-xl p-4 ${bgClass}`}>
      <div className={`text-3xl font-bold leading-none ${valueClass}`}>{value}</div>
      <div className="text-slate-600 text-xs mt-1.5">{label}</div>
    </div>
  );
}

/* ── Dashboard ───────────────────────────────────────────────── */
export default function Dashboard() {
  const [all, setAll]         = useState([]);
  const [stages, setStages]   = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [candidates, stgs] = await Promise.all([api.getReminders(), api.getStages()]);
    setAll(candidates);
    setStages(stgs);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (payload) => {
    const { _resumeFile, _removeResume, ...data } = payload;
    await api.updateCandidate(editing.id, data);
    if (_removeResume) {
      await api.deleteResume(editing.id);
    } else if (_resumeFile) {
      await api.uploadResume(editing.id, _resumeFile);
    }
    setEditing(null);
    load();
  };

  const handleAcknowledge = async (c, data = {}) => {
    await api.acknowledgeCandidate(c.id, data);
    load();
  };

  // ── Group candidates ──────────────────────────────────────
  const today   = localToday();
  const in7days = calendarDaysFromToday(7);

  const overdue    = all.filter(c => c.next_step_due && c.next_step_due < today);
  const dueToday   = all.filter(c => c.next_step_due === today);
  const dueSoon    = all.filter(c =>
    c.next_step_due && c.next_step_due > today && c.next_step_due <= in7days
  );
  const noDeadline = all.filter(c => !c.next_step_due);

  const totalCount = all.length;
  const todayStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-slate-400 text-sm">Loading…</span>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-slate-400 text-sm mt-0.5">{todayStr}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <StatCard value={overdue.length}    label="SLA Breached"  valueClass="text-red-600"    bgClass="bg-red-50    border-red-200" />
        <StatCard value={dueToday.length}   label="Due Today"     valueClass="text-orange-600" bgClass="bg-orange-50 border-orange-100" />
        <StatCard value={dueSoon.length}    label="Due This Week" valueClass="text-amber-600"  bgClass="bg-amber-50  border-amber-100" />
        <StatCard value={totalCount}        label="Active Total"  valueClass="text-blue-600"   bgClass="bg-blue-50   border-blue-100" />
      </div>

      {/* Empty state */}
      {totalCount === 0 && (
        <div className="text-center py-20">
          <div className="text-5xl mb-4">🎉</div>
          <p className="text-lg font-semibold text-slate-700">All caught up!</p>
          <p className="text-slate-400 text-sm mt-1">No active candidates need attention right now.</p>
        </div>
      )}

      <Section
        icon="🚨" title="SLA Breached — Contact immediately"
        titleClass="text-red-700"
        candidates={overdue}
        onEdit={setEditing}
        onAcknowledge={handleAcknowledge}
      />
      <Section
        icon="🟠" title="Due Today"
        titleClass="text-orange-700"
        candidates={dueToday}
        onEdit={setEditing}
        onAcknowledge={handleAcknowledge}
      />
      <Section
        icon="🟡" title="Due This Week"
        titleClass="text-amber-700"
        candidates={dueSoon}
        onEdit={setEditing}
        onAcknowledge={handleAcknowledge}
      />
      <Section
        icon="👻" title="No Deadline Set — At risk of ghosting"
        titleClass="text-slate-600"
        candidates={noDeadline}
        onEdit={setEditing}
        onAcknowledge={handleAcknowledge}
      />

      {editing && (
        <CandidateModal
          candidate={editing}
          stages={stages}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function LinkedInIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" style={{ display: 'inline', verticalAlign: 'middle' }}>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  );
}

function WorkdayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" style={{ display: 'inline', verticalAlign: 'middle' }}>
      <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 110-16 8 8 0 010 16zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
    </svg>
  );
}
