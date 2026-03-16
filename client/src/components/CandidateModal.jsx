import React, { useState, useEffect } from 'react';
import { api } from '../api';

export default function CandidateModal({ candidate, stages, onSave, onClose }) {
  const defaultStageId = stages[0]?.id ?? '';

  const [form, setForm] = useState({
    first_name:   '',
    last_name:    '',
    email:        '',
    stage_id:     defaultStageId,
    linkedin_url: '',
    wd_url:       '',
    notes:        '',
  });
  const [reqs, setReqs]               = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [resumeFile, setResumeFile]   = useState(null);   // new file chosen by user
  const [removeResume, setRemoveResume] = useState(false); // user wants to delete existing
  const [saving, setSaving]           = useState(false);

  useEffect(() => {
    if (candidate) {
      setForm({
        first_name:   candidate.first_name   ?? '',
        last_name:    candidate.last_name    ?? '',
        email:        candidate.email        ?? '',
        stage_id:     candidate.stage_id     ?? defaultStageId,
        linkedin_url: candidate.linkedin_url ?? '',
        wd_url:       candidate.wd_url       ?? '',
        notes:        candidate.notes        ?? '',
      });
      setSelectedIds((candidate.reqs || []).map(r => r.id));
    }
  }, [candidate]); // eslint-disable-line

  useEffect(() => { api.getReqs().then(setReqs); }, []);

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const toggleReq = (id) =>
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!form.first_name.trim()) return;
    setSaving(true);
    await onSave({
      ...form,
      stage_id:      Number(form.stage_id),
      req_ids:       selectedIds,
      _resumeFile:   resumeFile,
      _removeResume: removeResume,
    });
    setSaving(false);
  };

  const onBackdrop = (e) => { if (e.target === e.currentTarget) onClose(); };

  const openReqs  = reqs.filter(r => r.status === 'open');
  const otherReqs = reqs.filter(r => r.status !== 'open');

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onBackdrop}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800">
            {candidate
              ? `Edit: ${[candidate.first_name, candidate.last_name].filter(Boolean).join(' ')}`
              : 'Add Candidate'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
        </div>

        {/* Scrollable body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* First Name / Last Name */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">First Name *</label>
              <input
                required
                value={form.first_name}
                onChange={set('first_name')}
                placeholder="Jane"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Last Name</label>
              <input
                value={form.last_name}
                onChange={set('last_name')}
                placeholder="Smith"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Email / Stage */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={set('email')}
                placeholder="jane@example.com"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Stage *</label>
              <select
                required
                value={form.stage_id}
                onChange={set('stage_id')}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          {/* LinkedIn / Workday */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                LinkedIn URL
              </label>
              <input
                type="url"
                value={form.linkedin_url}
                onChange={set('linkedin_url')}
                placeholder="https://linkedin.com/in/…"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Workday URL
              </label>
              <input
                type="url"
                value={form.wd_url}
                onChange={set('wd_url')}
                placeholder="https://wd5.myworkday.com/…"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Stage deadline notice */}
          <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-700">
            <span className="mt-0.5">⏱</span>
            <span>
              A 5-business-day contact deadline is set automatically when a candidate enters a stage.
              Use <strong>Mark Contacted</strong> on the dashboard to reset the clock.
            </span>
          </div>

          {/* Requisitions */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Requisitions
              {selectedIds.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-normal">
                  {selectedIds.length} selected
                </span>
              )}
            </label>
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              {reqs.length === 0 ? (
                <p className="px-3 py-3 text-slate-400 text-xs italic">
                  No requisitions yet —{' '}
                  <a href="/reqs" className="text-blue-500 hover:underline" onClick={onClose}>
                    add one in Requisitions
                  </a>
                </p>
              ) : (
                <div className="max-h-36 overflow-y-auto divide-y divide-slate-100">
                  {openReqs.map(r => (
                    <ReqCheckbox
                      key={r.id} req={r}
                      checked={selectedIds.includes(r.id)}
                      onToggle={() => toggleReq(r.id)}
                    />
                  ))}
                  {otherReqs.length > 0 && (
                    <>
                      <div className="px-3 py-1 text-xs text-slate-400 bg-slate-50 font-medium">
                        Closed / On Hold
                      </div>
                      {otherReqs.map(r => (
                        <ReqCheckbox
                          key={r.id} req={r}
                          checked={selectedIds.includes(r.id)}
                          onToggle={() => toggleReq(r.id)}
                          dimmed
                        />
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Resume */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Resume</label>

            {/* Existing file */}
            {candidate?.resume_original_name && !removeResume && (
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg mb-2">
                <span className="text-base">📄</span>
                <a
                  href={`/uploads/${candidate.resume_path}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 text-sm text-blue-600 hover:underline truncate"
                >
                  {candidate.resume_original_name}
                </a>
                <button
                  type="button"
                  onClick={() => { setRemoveResume(true); setResumeFile(null); }}
                  className="text-xs text-red-500 hover:text-red-700 font-medium shrink-0"
                >
                  Remove
                </button>
              </div>
            )}

            {/* File picker — shown when no current file, or user chose to remove/replace */}
            {(!candidate?.resume_original_name || removeResume) && !resumeFile && (
              <label className="flex flex-col items-center justify-center gap-1 w-full border-2 border-dashed border-slate-300 rounded-lg px-4 py-4 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors text-slate-400 text-xs">
                <span className="text-2xl">📁</span>
                <span className="font-medium text-slate-500">Click to upload resume</span>
                <span>PDF, DOC, or DOCX · max 15 MB</span>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files[0];
                    if (f) { setResumeFile(f); setRemoveResume(false); }
                  }}
                />
              </label>
            )}

            {/* Newly selected file preview */}
            {resumeFile && (
              <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                <span className="text-base">📄</span>
                <span className="flex-1 text-sm text-green-800 truncate">{resumeFile.name}</span>
                <button
                  type="button"
                  onClick={() => setResumeFile(null)}
                  className="text-xs text-slate-400 hover:text-slate-600 shrink-0"
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Notes</label>
            <textarea
              rows={3}
              value={form.notes}
              onChange={set('notes')}
              placeholder="Interview feedback, sourcing notes, etc."
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60"
          >
            {saving ? 'Saving…' : candidate ? 'Save Changes' : 'Add Candidate'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function ReqCheckbox({ req, checked, onToggle, dimmed }) {
  const BADGE = {
    open:    'bg-green-100 text-green-700',
    on_hold: 'bg-amber-100 text-amber-700',
    closed:  'bg-slate-100 text-slate-500',
  };
  const statusLabel = req.status === 'on_hold' ? 'On Hold'
    : req.status.charAt(0).toUpperCase() + req.status.slice(1);

  return (
    <label className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50 ${dimmed ? 'opacity-60' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="rounded border-slate-300 text-blue-600"
      />
      <span className="font-mono text-xs text-slate-500 w-16 shrink-0">{req.req_id}</span>
      <span className="flex-1 text-sm text-slate-800">{req.title}</span>
      {req.department && <span className="text-xs text-slate-400">{req.department}</span>}
      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${BADGE[req.status]}`}>
        {statusLabel}
      </span>
    </label>
  );
}
