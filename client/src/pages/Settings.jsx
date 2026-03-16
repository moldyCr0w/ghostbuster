import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';

const COLORS = [
  '#6B7280', '#3B82F6', '#8B5CF6', '#F59E0B',
  '#10B981', '#EF4444', '#EC4899', '#14B8A6',
  '#F97316', '#6366F1', '#84CC16', '#06B6D4',
];

function ColorDot({ color, size = 'w-4 h-4' }) {
  return <div className={`${size} rounded-full flex-shrink-0`} style={{ backgroundColor: color }} />;
}

function ColorPicker({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1" style={{ maxWidth: 130 }}>
      {COLORS.map(c => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`w-5 h-5 rounded-full transition-transform hover:scale-110 ${
            value === c ? 'ring-2 ring-offset-1 ring-slate-500 scale-110' : ''
          }`}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}

export default function Settings() {
  const [stages, setStages]     = useState([]);
  const [newName, setNewName]   = useState('');
  const [newColor, setNewColor] = useState(COLORS[0]);
  const [newTerm, setNewTerm]   = useState(false);
  const [editId, setEditId]     = useState(null);
  const [editName, setEditName]   = useState('');
  const [editColor, setEditColor] = useState('');
  const [editTerm, setEditTerm]   = useState(false);
  const [error, setError]       = useState('');

  const load = useCallback(async () => {
    setStages(await api.getStages());
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setError('');
    await api.createStage({ name: newName.trim(), color: newColor, is_terminal: newTerm });
    setNewName('');
    setNewColor(COLORS[0]);
    setNewTerm(false);
    load();
  };

  const handleDelete = async (stage) => {
    setError('');
    const res = await api.deleteStage(stage.id);
    if (res.error) setError(res.error);
    else load();
  };

  const startEdit = (stage) => {
    setEditId(stage.id);
    setEditName(stage.name);
    setEditColor(stage.color);
    setEditTerm(!!stage.is_terminal);
  };

  const saveEdit = async (stage) => {
    await api.updateStage(stage.id, {
      name: editName,
      color: editColor,
      order_index: stage.order_index,
      is_terminal: editTerm,
    });
    setEditId(null);
    load();
  };

  const move = async (stage, dir) => {
    const idx  = stages.findIndex(s => s.id === stage.id);
    const swap = stages[dir === 'up' ? idx - 1 : idx + 1];
    if (!swap) return;
    await Promise.all([
      api.updateStage(stage.id, { name: stage.name, color: stage.color, order_index: swap.order_index, is_terminal: stage.is_terminal }),
      api.updateStage(swap.id,  { name: swap.name,  color: swap.color,  order_index: stage.order_index, is_terminal: swap.is_terminal }),
    ]);
    load();
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Settings</h1>
        <p className="text-slate-400 text-sm mt-0.5">Manage your hiring funnel stages</p>
      </div>

      {/* Stages list */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-5">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
          <p className="text-sm font-semibold text-slate-700">Funnel Stages</p>
          <p className="text-xs text-slate-400 mt-0.5">
            Stages marked as <strong>Terminal</strong> won't appear in dashboard reminders.
          </p>
        </div>

        {stages.length === 0 ? (
          <div className="py-10 text-center text-slate-400 text-sm">No stages yet.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {stages.map((stage, idx) => (
              <li key={stage.id} className="px-4 py-3 flex items-center gap-3">
                {editId === stage.id ? (
                  /* ── edit row ── */
                  <>
                    <ColorDot color={editColor} />
                    <input
                      autoFocus
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <ColorPicker value={editColor} onChange={setEditColor} />
                    <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={editTerm}
                        onChange={e => setEditTerm(e.target.checked)}
                        className="rounded"
                      />
                      Terminal
                    </label>
                    <button onClick={() => saveEdit(stage)} className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700">Save</button>
                    <button onClick={() => setEditId(null)} className="px-3 py-1.5 bg-slate-100 text-slate-600 text-xs rounded-lg hover:bg-slate-200">Cancel</button>
                  </>
                ) : (
                  /* ── display row ── */
                  <>
                    <ColorDot color={stage.color} />
                    <span className="flex-1 text-sm text-slate-800 font-medium">{stage.name}</span>
                    {stage.is_terminal ? (
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-xs rounded-full">Terminal</span>
                    ) : null}
                    <div className="flex items-center gap-1 ml-2">
                      <button disabled={idx === 0}              onClick={() => move(stage, 'up')}   className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-25 text-base leading-none">↑</button>
                      <button disabled={idx === stages.length - 1} onClick={() => move(stage, 'down')} className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-25 text-base leading-none">↓</button>
                      <button onClick={() => startEdit(stage)} className="px-2.5 py-1 text-xs bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 ml-1">Edit</button>
                      <button onClick={() => handleDelete(stage)} className="px-2.5 py-1 text-xs bg-red-50 text-red-500 rounded-lg hover:bg-red-100">Delete</button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && (
        <p className="text-red-600 text-sm mb-4 bg-red-50 border border-red-100 rounded-lg px-4 py-2">{error}</p>
      )}

      {/* Add new stage */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Add New Stage</h3>
        <form onSubmit={handleAdd} className="space-y-3">
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-xs text-slate-500 mb-1">Stage Name</label>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Background Check"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Color</label>
              <ColorPicker value={newColor} onChange={setNewColor} />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={newTerm}
                onChange={e => setNewTerm(e.target.checked)}
                className="rounded"
              />
              Terminal stage (exclude from reminders)
            </label>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Add Stage
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
