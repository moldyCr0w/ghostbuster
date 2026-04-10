import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';

/* ── Helpers ──────────────────────────────────────────────────── */

function toLocalDatetimeValue(isoString) {
  if (!isoString) return '';
  // Browsers expect YYYY-MM-DDTHH:MM for datetime-local
  return isoString.slice(0, 16);
}

function localDatetimeToISO(localVal) {
  if (!localVal) return '';
  // datetime-local gives us YYYY-MM-DDTHH:MM (no tz) — treat as local time
  return new Date(localVal).toISOString();
}

function formatWindowLabel(w, index) {
  if (!w.start || !w.end) return `Window ${index + 1}`;
  const s = new Date(w.start);
  const e = new Date(w.end);
  return `${s.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${s.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${e.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

const LEVEL_LABELS = { senior: 'Senior', staff_plus: 'Staff+' };
const DURATION_OPTIONS = [30, 45, 60, 90, 120];

/* ── Sub-components ───────────────────────────────────────────── */

function CandidateSelector({ candidates, selectedId, onSelect }) {
  const [search, setSearch] = useState('');

  const filtered = candidates.filter(c => {
    const q = search.toLowerCase();
    return (
      c.name?.toLowerCase().includes(q) ||
      c.role?.toLowerCase().includes(q) ||
      c.company?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col h-full">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Candidate</p>
      <input
        type="text"
        placeholder="Search candidates…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full border border-slate-200 rounded px-3 py-1.5 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-indigo-400"
      />
      <div className="flex-1 overflow-y-auto space-y-1">
        {filtered.length === 0 && (
          <p className="text-xs text-slate-400 text-center pt-4">No candidates found</p>
        )}
        {filtered.map(c => (
          <button
            key={c.id}
            onClick={() => onSelect(c.id === selectedId ? null : c.id)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
              c.id === selectedId
                ? 'bg-indigo-600 text-white'
                : 'hover:bg-slate-100 text-slate-800'
            }`}
          >
            <div className="font-medium truncate">{c.name}</div>
            {(c.role || c.company) && (
              <div className={`text-xs truncate ${c.id === selectedId ? 'text-indigo-200' : 'text-slate-500'}`}>
                {[c.role, c.company].filter(Boolean).join(' · ')}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function WindowRow({ window: w, index, onChange, onRemove, canRemove }) {
  return (
    <div className="border border-slate-200 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500">Window {index + 1}</span>
        {canRemove && (
          <button
            onClick={() => onRemove(index)}
            className="text-slate-400 hover:text-red-500 text-xs"
          >
            ✕ Remove
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Start</label>
          <input
            type="datetime-local"
            value={toLocalDatetimeValue(w.start)}
            onChange={e => onChange(index, 'start', localDatetimeToISO(e.target.value))}
            className="w-full border border-slate-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">End</label>
          <input
            type="datetime-local"
            value={toLocalDatetimeValue(w.end)}
            onChange={e => onChange(index, 'end', localDatetimeToISO(e.target.value))}
            className="w-full border border-slate-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
      </div>
    </div>
  );
}

function PanelistCard({ panelist, windows, selected, onToggle }) {
  const allFree   = panelist.windows.every(w => w.free === true);
  const noneFree  = panelist.windows.every(w => w.free === false);
  const noCalData = panelist.windows.every(w => w.free === null);

  return (
    <div
      className={`border rounded-lg p-3 cursor-pointer transition-all ${
        selected
          ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-400'
          : 'border-slate-200 hover:border-slate-300 bg-white'
      }`}
      onClick={onToggle}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
              selected ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300'
            }`}>
              {selected && <span className="text-white text-[9px] font-bold">✓</span>}
            </span>
            <p className="font-medium text-sm text-slate-800 truncate">{panelist.name}</p>
          </div>
          <p className="text-xs text-slate-500 mt-0.5 ml-6 truncate">{panelist.title || panelist.email}</p>
          {panelist.qualifications?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5 ml-6">
              {panelist.qualifications.map(tag => (
                <span
                  key={tag.id}
                  className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                  style={{ backgroundColor: tag.color + '22', color: tag.color }}
                >
                  {tag.name}
                </span>
              ))}
              {panelist.interview_levels?.map(l => (
                <span key={l} className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
                  {LEVEL_LABELS[l] || l}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Availability indicator summary */}
        {noCalData ? (
          <span className="text-xs text-slate-400 shrink-0">No cal data</span>
        ) : (
          <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${
            allFree  ? 'bg-green-100 text-green-700' :
            noneFree ? 'bg-red-100 text-red-600'    :
                       'bg-yellow-100 text-yellow-700'
          }`}>
            {allFree ? 'All free' : noneFree ? 'Busy' : 'Partial'}
          </span>
        )}
      </div>

      {/* Per-window breakdown */}
      {windows.length > 1 && !noCalData && (
        <div className="mt-2 ml-6 flex flex-wrap gap-1.5">
          {panelist.windows.map((pw, i) => (
            <span
              key={i}
              title={`Window ${i + 1}: ${pw.free ? 'Free' : pw.free === false ? `Busy (${pw.conflictCount} conflict${pw.conflictCount !== 1 ? 's' : ''})` : 'Unknown'}`}
              className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                pw.free === true  ? 'bg-green-100 text-green-700' :
                pw.free === false ? 'bg-red-100 text-red-600'    :
                                    'bg-slate-100 text-slate-500'
              }`}
            >
              W{i + 1}: {pw.free === true ? 'Free' : pw.free === false ? 'Busy' : '—'}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Main page ────────────────────────────────────────────────── */

export default function SchedulingTool() {
  // Data
  const [candidates,   setCandidates]   = useState([]);
  const [tags,         setTags]         = useState([]);

  // Selection state
  const [selectedCandidateId, setSelectedCandidateId] = useState(null);
  const [windows,             setWindows]              = useState([{ start: '', end: '' }]);
  const [durationMins,        setDurationMins]         = useState(60);
  const [filterLevel,         setFilterLevel]          = useState('');
  const [filterTagIds,        setFilterTagIds]         = useState([]);

  // Results
  const [results,           setResults]           = useState(null);   // null = not checked yet
  const [selectedPanelists, setSelectedPanelists] = useState([]);
  const [loading,           setLoading]           = useState(false);
  const [error,             setError]             = useState('');
  const [calNotConnected,   setCalNotConnected]   = useState(false);

  // Load candidates and tags on mount
  useEffect(() => {
    api.getCandidates?.().then(d => setCandidates(Array.isArray(d) ? d : d?.candidates || [])).catch(() => {});
    api.getPanelistTags().then(d => setTags(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const selectedCandidate = candidates.find(c => c.id === selectedCandidateId) || null;

  /* Window management */
  const handleWindowChange = (index, field, value) => {
    setWindows(prev => prev.map((w, i) => i === index ? { ...w, [field]: value } : w));
    setResults(null);
  };

  const addWindow = () => {
    setWindows(prev => [...prev, { start: '', end: '' }]);
    setResults(null);
  };

  const removeWindow = (index) => {
    setWindows(prev => prev.filter((_, i) => i !== index));
    setResults(null);
  };

  /* Tag filter toggle */
  const toggleTag = (tagId) => {
    setFilterTagIds(prev =>
      prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]
    );
    setResults(null);
  };

  /* Availability check */
  const checkAvailability = useCallback(async () => {
    const validWindows = windows.filter(w => w.start && w.end);
    if (!validWindows.length) {
      setError('Add at least one availability window with a start and end time.');
      return;
    }
    for (const w of validWindows) {
      if (new Date(w.start) >= new Date(w.end)) {
        setError('Each window\'s end time must be after its start time.');
        return;
      }
    }

    setError('');
    setLoading(true);
    setResults(null);
    setSelectedPanelists([]);

    try {
      const data = await api.checkSchedulingAvailability({
        windows:      validWindows,
        level:        filterLevel || undefined,
        tag_ids:      filterTagIds,
        duration_mins: durationMins,
      });
      setResults(data.panelists || []);
      setCalNotConnected(!!data.calendarNotConnected);
    } catch (err) {
      setError(err.message || 'Failed to check availability');
    } finally {
      setLoading(false);
    }
  }, [windows, filterLevel, filterTagIds, durationMins]);

  /* Panelist selection toggle */
  const togglePanelist = (id) => {
    setSelectedPanelists(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  /* Sort results: all-free first, then partial, then busy */
  const sortedResults = results ? [...results].sort((a, b) => {
    const score = p => {
      if (p.windows.every(w => w.free === true))  return 0;
      if (p.windows.some(w => w.free === true))    return 1;
      return 2;
    };
    return score(a) - score(b);
  }) : [];

  const validWindowCount = windows.filter(w => w.start && w.end).length;

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 bg-white shrink-0">
        <h1 className="text-lg font-bold text-slate-800">Scheduling Tool</h1>
        <p className="text-sm text-slate-500">Select a candidate, enter their availability windows, and find open panelists.</p>
      </div>

      {/* Three-column layout */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Left: Candidate selector ─────────────────────────── */}
        <div className="w-64 shrink-0 border-r border-slate-200 bg-white p-4 flex flex-col overflow-hidden">
          <CandidateSelector
            candidates={candidates}
            selectedId={selectedCandidateId}
            onSelect={setSelectedCandidateId}
          />
        </div>

        {/* ── Middle: Windows + filters ─────────────────────────── */}
        <div className="w-80 shrink-0 border-r border-slate-200 bg-white p-4 flex flex-col gap-4 overflow-y-auto">

          {/* Candidate banner */}
          {selectedCandidate ? (
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
              <p className="text-xs font-semibold text-indigo-700 truncate">{selectedCandidate.name}</p>
              <p className="text-xs text-indigo-500 truncate">{[selectedCandidate.role, selectedCandidate.company].filter(Boolean).join(' · ')}</p>
            </div>
          ) : (
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-400">
              No candidate selected (optional)
            </div>
          )}

          {/* Duration */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Interview Duration
            </label>
            <select
              value={durationMins}
              onChange={e => { setDurationMins(Number(e.target.value)); setResults(null); }}
              className="w-full border border-slate-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              {DURATION_OPTIONS.map(d => (
                <option key={d} value={d}>{d} minutes</option>
              ))}
            </select>
          </div>

          {/* Availability Windows */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Candidate Availability
            </label>
            <div className="space-y-2">
              {windows.map((w, i) => (
                <WindowRow
                  key={i}
                  window={w}
                  index={i}
                  onChange={handleWindowChange}
                  onRemove={removeWindow}
                  canRemove={windows.length > 1}
                />
              ))}
            </div>
            <button
              onClick={addWindow}
              className="mt-2 w-full text-xs text-indigo-600 hover:text-indigo-800 border border-dashed border-indigo-300 rounded-lg py-2 transition-colors"
            >
              + Add Window
            </button>
          </div>

          {/* Panelist filters */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Panelist Filters
            </label>

            {/* Level */}
            <div className="mb-2">
              <p className="text-xs text-slate-500 mb-1">Seniority Level</p>
              <div className="flex gap-2">
                {['', 'senior', 'staff_plus'].map(l => (
                  <button
                    key={l}
                    onClick={() => { setFilterLevel(l); setResults(null); }}
                    className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                      filterLevel === l
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'border-slate-300 text-slate-600 hover:border-indigo-400'
                    }`}
                  >
                    {l === '' ? 'Any' : LEVEL_LABELS[l]}
                  </button>
                ))}
              </div>
            </div>

            {/* Tags */}
            {tags.length > 0 && (
              <div>
                <p className="text-xs text-slate-500 mb-1">Technology / Skills</p>
                <div className="flex flex-wrap gap-1.5">
                  {tags.map(tag => (
                    <button
                      key={tag.id}
                      onClick={() => toggleTag(tag.id)}
                      className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-all ${
                        filterTagIds.includes(tag.id)
                          ? 'ring-2 ring-offset-1'
                          : 'opacity-70 hover:opacity-100'
                      }`}
                      style={
                        filterTagIds.includes(tag.id)
                          ? { backgroundColor: tag.color + '33', color: tag.color, borderColor: tag.color, ringColor: tag.color }
                          : { backgroundColor: tag.color + '18', color: tag.color, borderColor: tag.color + '55' }
                      }
                    >
                      {tag.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Check button */}
          <button
            onClick={checkAvailability}
            disabled={loading || validWindowCount === 0}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
          >
            {loading ? 'Checking…' : 'Check Availability'}
          </button>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</p>
          )}
        </div>

        {/* ── Right: Results ────────────────────────────────────── */}
        <div className="flex-1 p-4 overflow-y-auto">
          {/* Window legend */}
          {results !== null && windows.filter(w => w.start && w.end).length > 1 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {windows.filter(w => w.start && w.end).map((w, i) => (
                <span key={i} className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded">
                  <span className="font-semibold">W{i + 1}:</span> {formatWindowLabel(w, i)}
                </span>
              ))}
            </div>
          )}

          {calNotConnected && results !== null && (
            <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-700">
              Google Calendar is not connected — panelist list shown without availability data.
              Connect in <strong>Settings</strong> to see real-time availability.
            </div>
          )}

          {results === null && !loading && (
            <div className="h-full flex flex-col items-center justify-center text-slate-400">
              <span className="text-5xl mb-3">📅</span>
              <p className="text-sm font-medium">Enter availability windows and click Check Availability</p>
              <p className="text-xs mt-1">Panelists will be ranked by how many windows they're free for</p>
            </div>
          )}

          {loading && (
            <div className="h-full flex flex-col items-center justify-center text-slate-400">
              <div className="w-8 h-8 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin mb-3" />
              <p className="text-sm">Checking panelist calendars…</p>
            </div>
          )}

          {!loading && results !== null && (
            <>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {sortedResults.length} panelist{sortedResults.length !== 1 ? 's' : ''} found
                  {selectedPanelists.length > 0 && ` · ${selectedPanelists.length} selected`}
                </p>
                {selectedPanelists.length > 0 && (
                  <button
                    onClick={() => setSelectedPanelists([])}
                    className="text-xs text-slate-400 hover:text-slate-600"
                  >
                    Clear selection
                  </button>
                )}
              </div>

              {sortedResults.length === 0 ? (
                <p className="text-sm text-slate-400 text-center pt-8">
                  No panelists match the current filters.
                </p>
              ) : (
                <div className="space-y-2">
                  {sortedResults.map(p => (
                    <PanelistCard
                      key={p.id}
                      panelist={p}
                      windows={windows.filter(w => w.start && w.end)}
                      selected={selectedPanelists.includes(p.id)}
                      onToggle={() => togglePanelist(p.id)}
                    />
                  ))}
                </div>
              )}

              {/* Selected panel summary */}
              {selectedPanelists.length > 0 && (
                <div className="mt-4 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                  <p className="text-xs font-semibold text-indigo-700 mb-1">Selected Panel</p>
                  {sortedResults
                    .filter(p => selectedPanelists.includes(p.id))
                    .map(p => (
                      <p key={p.id} className="text-xs text-indigo-600">
                        {p.name}
                        {p.title && ` · ${p.title}`}
                      </p>
                    ))}
                  <p className="text-[10px] text-indigo-400 mt-2">
                    Use the Pipeline or Board to create schedule links for these panelists.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
