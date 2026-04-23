import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';

export default function ScreenReview() {
  const { token } = useParams();
  const [screen,   setScreen]   = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [hmName,   setHmName]   = useState('');
  const [hmNotes,  setHmNotes]  = useState('');
  const [saving,   setSaving]   = useState(false);
  const [submitted,setSubmitted]= useState(false);

  useEffect(() => {
    api.getSharedScreen(token)
      .then(data => {
        if (data.error) { setError('Screen not found or link is invalid.'); }
        else { setScreen(data); }
      })
      .catch(() => setError('Failed to load screen.'))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleDecision(decision) {
    if (!hmName.trim()) { alert('Please enter your name before submitting.'); return; }
    setSaving(true);
    try {
      const updated = await api.submitDecision(token, { hm_decision: decision, hm_name: hmName, hm_notes: hmNotes });
      setScreen(updated);
      setSubmitted(true);
    } catch {
      alert('Failed to submit decision. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <p className="text-slate-400 text-sm animate-pulse">Loading candidate screen…</p>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center">
        <p className="text-4xl mb-3">👻</p>
        <p className="text-slate-700 font-medium">{error}</p>
      </div>
    </div>
  );

  const decided = !!screen.hm_decision;
  const isGo    = screen.hm_decision === 'go';

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <span className="text-3xl">👻</span>
          <div>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">GhostBuster</p>
            <h1 className="text-lg font-bold text-slate-900">Candidate Screen Review</h1>
          </div>
        </div>

        {/* Candidate info */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-xl font-bold text-slate-900">{screen.candidate_name}</h2>
          {screen.candidate_role && (
            <p className="text-sm text-slate-500 mt-0.5">{screen.candidate_role}</p>
          )}
          <p className="text-sm text-slate-400 mt-1">{screen.req_title}</p>
          {screen.created_by && (
            <p className="text-xs text-slate-400 mt-2">Screen prepared by: {screen.created_by}</p>
          )}
        </div>

        {/* Screen summary */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Screen Summary</h3>
          {screen.summary ? (
            <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">
              {screen.summary}
            </pre>
          ) : (
            <p className="text-sm text-slate-400 italic">No summary provided.</p>
          )}
        </div>

        {/* Decision section */}
        {decided ? (
          <div className={`rounded-xl border-2 p-5 ${isGo ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">{isGo ? '✅' : '❌'}</span>
              <p className={`font-bold ${isGo ? 'text-green-800' : 'text-red-800'}`}>
                Decision recorded: {isGo ? 'Go — Advance to Panel' : 'No Go'}
              </p>
            </div>
            <p className="text-sm text-slate-600">
              {screen.hm_name && <span className="font-medium">{screen.hm_name}</span>}
              {screen.decided_at && (
                <span className="text-slate-400"> · {new Date(screen.decided_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              )}
            </p>
            {screen.hm_notes && (
              <p className="text-sm text-slate-700 mt-2 italic">"{screen.hm_notes}"</p>
            )}
            <p className="text-xs text-slate-400 mt-3">Decision is locked after submission.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Your Feedback</h3>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Your name</label>
              <input
                type="text"
                value={hmName}
                onChange={e => setHmName(e.target.value)}
                placeholder="e.g. Alex Johnson"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Notes <span className="text-slate-400 font-normal">(optional)</span></label>
              <textarea
                value={hmNotes}
                onChange={e => setHmNotes(e.target.value)}
                rows={3}
                placeholder="Any comments about this candidate…"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => handleDecision('go')}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                ✓ Go — Advance to Panel
              </button>
              <button
                onClick={() => handleDecision('no_go')}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                ✗ No Go
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
