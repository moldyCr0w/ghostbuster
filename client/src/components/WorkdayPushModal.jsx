import { useState, useEffect } from 'react';
import { api } from '../api';

const STATUS_STYLES = {
  open:   'bg-emerald-50 text-emerald-700 border border-emerald-200',
  pushed: 'bg-amber-50 text-amber-700 border border-amber-200',
  filled: 'bg-slate-100 text-slate-500 border border-slate-200',
};

export default function WorkdayPushModal({ candidate, onClose, onSuccess }) {
  const [slots, setSlots]           = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [selectedSlotId, setSelectedSlotId] = useState('');
  const [manualReqId, setManualReqId]       = useState('');
  const [useManual, setUseManual]           = useState(false);
  const [pushing, setPushing]               = useState(false);
  const [error, setError]                   = useState('');

  // The Ghostbuster req IDs this candidate is linked to
  const linkedReqIds = (candidate.reqs || []).map(r => r.id);

  useEffect(() => {
    async function loadSlots() {
      if (linkedReqIds.length === 0) { setSlotsLoading(false); return; }
      // Load WD slots for all linked reqs in parallel
      const results = await Promise.all(
        linkedReqIds.map(rid => api.getWdSlots(rid).catch(() => []))
      );
      const allSlots = results.flat();
      setSlots(allSlots);
      // Pre-select the first open slot if there is one
      const firstOpen = allSlots.find(s => s.status === 'open');
      if (firstOpen) setSelectedSlotId(String(firstOpen.id));
      setSlotsLoading(false);
    }
    loadSlots();
  }, []); // eslint-disable-line

  const selectedSlot = slots.find(s => String(s.id) === selectedSlotId) || null;
  const resolvedReqId = useManual ? manualReqId.trim() : selectedSlot?.wd_req_id || '';
  const canPush = !!resolvedReqId;

  const handlePush = async () => {
    if (!canPush) return;
    setPushing(true);
    setError('');
    try {
      const payload = {
        wd_req_id: resolvedReqId,
        slot_id:   !useManual && selectedSlotId ? Number(selectedSlotId) : undefined,
      };
      const res = await api.workdayPush(candidate.id, payload);
      if (res.error) { setError(res.error); setPushing(false); return; }
      onSuccess(res.wd_applicant_id);
    } catch (err) {
      setError(err.message || 'Unexpected error');
      setPushing(false);
    }
  };

  const openSlots   = slots.filter(s => s.status === 'open');
  const pushedSlots = slots.filter(s => s.status !== 'open');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Push to Workday</h2>
            <p className="text-sm text-slate-400 mt-0.5">
              {candidate.first_name} {candidate.last_name}
              {candidate.email ? ` · ${candidate.email}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 mt-0.5 text-lg leading-none">✕</button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5 overflow-y-auto">

          {/* Resume indicator */}
          <div className="flex items-center gap-2 text-sm">
            {candidate.resume_path ? (
              <>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-medium">
                  <span>✓</span> Resume on file
                </span>
                <span className="text-slate-400 text-xs">{candidate.resume_original_name || candidate.resume_path}</span>
              </>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-xs font-medium">
                ⚠ No resume on file — push will continue without one
              </span>
            )}
          </div>

          {/* Workday req selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
              Workday Requisition
            </label>

            {slotsLoading ? (
              <p className="text-sm text-slate-400">Loading available slots…</p>
            ) : (
              <>
                {slots.length > 0 && !useManual && (
                  <div className="space-y-2 mb-3">
                    {openSlots.length === 0 && (
                      <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                        No open HC slots — all slots have already been pushed. Enter a Workday req ID manually below.
                      </p>
                    )}
                    {openSlots.map(slot => (
                      <label key={slot.id} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${selectedSlotId === String(slot.id) ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
                        <input
                          type="radio"
                          name="slot"
                          value={slot.id}
                          checked={selectedSlotId === String(slot.id)}
                          onChange={() => setSelectedSlotId(String(slot.id))}
                          className="accent-blue-600"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-semibold text-slate-800">{slot.wd_req_id}</span>
                            {slot.label && <span className="text-xs text-slate-400">{slot.label}</span>}
                            <span className={`ml-auto px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[slot.status]}`}>
                              {slot.status}
                            </span>
                          </div>
                        </div>
                      </label>
                    ))}
                    {pushedSlots.length > 0 && (
                      <div className="space-y-1">
                        {pushedSlots.map(slot => (
                          <div key={slot.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 text-slate-400 text-sm">
                            <span className="font-mono text-xs">{slot.wd_req_id}</span>
                            {slot.label && <span className="text-xs">{slot.label}</span>}
                            <span className={`ml-auto px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[slot.status]}`}>
                              {slot.status}
                            </span>
                            {slot.candidate_name && (
                              <span className="text-xs text-slate-400">→ {slot.candidate_name}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Manual entry toggle */}
                {slots.length > 0 && (
                  <button
                    type="button"
                    onClick={() => { setUseManual(v => !v); setSelectedSlotId(''); }}
                    className="text-xs text-blue-600 hover:underline mb-2"
                  >
                    {useManual ? '← Use a configured slot' : 'Enter a different Workday req ID manually'}
                  </button>
                )}

                {(useManual || slots.length === 0) && (
                  <div>
                    {slots.length === 0 && (
                      <p className="text-xs text-slate-400 mb-2">
                        No HC slots configured for this req yet. Enter the Workday req ID directly.
                      </p>
                    )}
                    <input
                      type="text"
                      value={manualReqId}
                      onChange={e => setManualReqId(e.target.value)}
                      placeholder="e.g. JR000001"
                      autoFocus
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}
              </>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={pushing}
            className="px-4 py-2 text-sm text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handlePush}
            disabled={!canPush || pushing}
            className="px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
          >
            {pushing ? (
              <>
                <span className="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Pushing…
              </>
            ) : (
              'Push to Workday'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
