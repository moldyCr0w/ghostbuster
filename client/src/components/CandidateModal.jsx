import React, { useState, useEffect } from 'react';
import { api } from '../api';

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function CandidateModal({ candidate, stages, onSave, onClose }) {
  const defaultStageId = stages[0]?.id ?? '';

  const [form, setForm] = useState({
    first_name:       '',
    last_name:        '',
    email:            '',
    stage_id:         defaultStageId,
    linkedin_url:     '',
    wd_url:           '',
    notes:            '',
    hired_for_req_id: '',
    contact_date:     todayStr(),
  });
  const [reqs, setReqs]               = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [resumeFile, setResumeFile]   = useState(null);   // new file chosen by user
  const [removeResume, setRemoveResume] = useState(false); // user wants to delete existing
  const [parsing, setParsing]         = useState(false);  // resume parsing in-flight
  const [parsedFields, setParsedFields] = useState([]);   // which fields were auto-filled
  const [saving, setSaving]           = useState(false);

  useEffect(() => {
    if (candidate) {
      setForm({
        first_name:       candidate.first_name       ?? '',
        last_name:        candidate.last_name        ?? '',
        email:            candidate.email            ?? '',
        stage_id:         candidate.stage_id         ?? defaultStageId,
        linkedin_url:     candidate.linkedin_url     ?? '',
        wd_url:           candidate.wd_url           ?? '',
        notes:            candidate.notes            ?? '',
        hired_for_req_id: candidate.hired_for_req_id ?? '',
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

  // Parse resume on file select and auto-fill any empty form fields
  const handleFileSelect = async (file) => {
    setResumeFile(file);
    setRemoveResume(false);
    setParsedFields([]);
    setParsing(true);
    try {
      const parsed = await api.parseResume(file);
      const filled = [];
      setForm(prev => {
        const next = { ...prev };
        if (parsed.first_name && !prev.first_name) { next.first_name = parsed.first_name; filled.push('First name'); }
        if (parsed.last_name  && !prev.last_name)  { next.last_name  = parsed.last_name;  filled.push('Last name'); }
        if (parsed.email      && !prev.email)       { next.email      = parsed.email;      filled.push('Email'); }
        if (parsed.linkedin_url && !prev.linkedin_url) { next.linkedin_url = parsed.linkedin_url; filled.push('LinkedIn'); }
        return next;
      });
      setParsedFields(filled);
    } catch (_) { /* parsing failed silently */ }
    setParsing(false);
  };

  // Determine if the currently selected stage is a hire stage
  const selectedStage = stages.find(s => s.id === Number(form.stage_id));
  const isHireStage   = !!selectedStage?.is_hire;

  // Reqs the candidate is linked to (for the "Filling Req" dropdown)
  const linkedReqs = reqs.filter(r => selectedIds.includes(r.id));

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!form.first_name.trim()) return;
    setSaving(true);
    await onSave({
      ...form,
      stage_id:         Number(form.stage_id),
      hired_for_req_id: isHireStage && form.hired_for_req_id ? Number(form.hired_for_req_id) : null,
      req_ids:          selectedIds,
      _resumeFile:      resumeFile,
      _removeResume:    removeResume,
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

          {/* ── Hire section — only shown when stage is_hire=1 ── */}
          {isHireStage && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 space-y-2">
              <p className="text-xs font-semibold text-green-800 flex items-center gap-1.5">
                🎉 Hire — Which req does this fill?
              </p>
              {linkedReqs.length === 0 ? (
                <p className="text-xs text-green-700 opacity-80">
                  No reqs linked to this candidate. Link a req below first, or leave blank.
                </p>
              ) : (
                <select
                  value={form.hired_for_req_id}
                  onChange={set('hired_for_req_id')}
                  className="w-full border border-green-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">— Select req to close as Filled —</option>
                  {linkedReqs.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.req_id} · {r.title}
                    </option>
                  ))}
                </select>
              )}
              <p className="text-xs text-green-700 opacity-70">
                The selected req will be automatically marked as <strong>Filled</strong>.
              </p>
            </div>
          )}

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

          {/* Initial contact date — only when adding a new candidate to a non-terminal stage */}
          {!candidate && !selectedStage?.is_terminal && !isHireStage && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Initial Contact Date
              </label>
              <input
                type="date"
                max={todayStr()}
                value={form.contact_date}
                onChange={set('contact_date')}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-slate-400">
                When did you first speak with this candidate? The 5-business-day SLA starts from this date.
              </p>
            </div>
          )}

          {/* Stage deadline notice — hide for hire/terminal stages */}
          {!selectedStage?.is_terminal && (
            <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-700">
              <span className="mt-0.5">⏱</span>
              <span>
                {candidate
                  ? <>A 5-business-day contact deadline is set automatically when a candidate enters a stage. Use <strong>Mark Contacted</strong> on the dashboard to reset the clock.</>
                  : <>SLA deadline = 5 business days from the initial contact date above. Use <strong>Mark Contacted</strong> on the dashboard to reset the clock.</>
                }
              </span>
            </div>
          )}

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
                <span>PDF, DOC, or DOCX · max 15 MB · fields auto-filled on upload</span>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  onChange={e => { const f = e.target.files[0]; if (f) handleFileSelect(f); }}
                />
              </label>
            )}

            {/* Newly selected file — with parse status */}
            {resumeFile && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                  <span className="text-base">{parsing ? '⏳' : '📄'}</span>
                  <span className="flex-1 text-sm text-green-800 truncate">{resumeFile.name}</span>
                  {parsing && <span className="text-xs text-green-600 shrink-0">Parsing…</span>}
                  <button
                    type="button"
                    onClick={() => { setResumeFile(null); setParsedFields([]); }}
                    className="text-xs text-slate-400 hover:text-slate-600 shrink-0"
                  >
                    ✕
                  </button>
                </div>
                {/* Parsed fields indicator */}
                {!parsing && parsedFields.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 px-1">
                    <span className="text-xs text-slate-400">✨ Auto-filled:</span>
                    {parsedFields.map(f => (
                      <span key={f} className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">
                        {f}
                      </span>
                    ))}
                  </div>
                )}
                {!parsing && parsedFields.length === 0 && (
                  <p className="text-xs text-slate-400 px-1">
                    Couldn't extract fields from this file — fill in manually.
                  </p>
                )}
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
    filled:  'bg-blue-100  text-blue-700',
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
      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${BADGE[req.status] || BADGE.closed}`}>
        {statusLabel}
      </span>
    </label>
  );
}
