import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';

/* ── Step row inside a plan editor ─────────────────────────────── */
function StepRow({ step, index, total, stages, planId, onUpdated, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [name, setName]       = useState(step.name);
  const [stageId, setStageId] = useState(step.stage_id || '');
  const [saving, setSaving]   = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const updated = await api.updatePlanStep(planId, step.id, {
      name: name.trim(),
      stage_id:    stageId || null,
      order_index: step.order_index,
    });
    setSaving(false);
    setEditing(false);
    onUpdated(updated);
  };

  const handleMove = async (direction) => {
    // Swap order_index with neighbour by sending new order array
    // Re-fetch plan to get current order, then reorder
    const plan = await api.getInterviewPlan(planId);
    const steps = [...plan.steps];
    const idx = steps.findIndex(s => s.id === step.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= steps.length) return;
    [steps[idx], steps[swapIdx]] = [steps[swapIdx], steps[idx]];
    const updated = await api.reorderPlanSteps(planId, steps.map(s => s.id));
    onUpdated(updated);
  };

  const handleDelete = async () => {
    const updated = await api.deletePlanStep(planId, step.id);
    onUpdated(updated);
  };

  const stage = stages.find(s => s.id === Number(stageId));

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-100 last:border-b-0">
      {/* Step number */}
      <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 text-xs font-bold flex items-center justify-center shrink-0">
        {index + 1}
      </span>

      {editing ? (
        <div className="flex-1 flex flex-wrap items-end gap-2">
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            className="flex-1 min-w-36 border border-slate-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g. Pair Coding Interview"
          />
          <select
            value={stageId}
            onChange={e => setStageId(e.target.value)}
            className="w-44 border border-slate-300 rounded-lg px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">— No stage —</option>
            {stages.filter(s => !s.is_terminal).map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className="px-3 py-1 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => { setEditing(false); setName(step.name); setStageId(step.stage_id || ''); }}
              className="px-3 py-1 bg-slate-100 text-slate-600 text-xs rounded-lg hover:bg-slate-200"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center gap-3 min-w-0">
          <span className="text-sm text-slate-800 font-medium truncate">{step.name}</span>
          {step.stage_name ? (
            <span
              className="shrink-0 px-2 py-0.5 rounded-full text-xs font-medium"
              style={{
                backgroundColor: (step.stage_color || '#94a3b8') + '22',
                color: step.stage_color || '#64748b',
                border: `1px solid ${(step.stage_color || '#94a3b8')}44`,
              }}
            >
              {step.stage_name}
            </span>
          ) : (
            <span className="shrink-0 text-xs text-slate-300 italic">No stage mapped</span>
          )}
        </div>
      )}

      {!editing && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => handleMove('up')}
            disabled={index === 0}
            className="p-1 text-slate-300 hover:text-slate-600 disabled:opacity-30"
            title="Move up"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => handleMove('down')}
            disabled={index === total - 1}
            className="p-1 text-slate-300 hover:text-slate-600 disabled:opacity-30"
            title="Move down"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="px-2 py-1 text-xs bg-slate-100 text-slate-600 rounded hover:bg-slate-200"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="px-2 py-1 text-xs bg-red-50 text-red-500 rounded hover:bg-red-100"
          >
            Remove
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Plan card / editor ─────────────────────────────────────────── */
function PlanCard({ plan, stages, onUpdated, onDeleted }) {
  const [editingName, setEditingName] = useState(false);
  const [name, setName]               = useState(plan.name);
  const [desc, setDesc]               = useState(plan.description || '');
  const [nameSaving, setNameSaving]   = useState(false);
  const [showAddStep, setShowAddStep] = useState(false);
  const [newStepName, setNewStepName] = useState('');
  const [newStepStage, setNewStepStage] = useState('');
  const [addingSteep, setAddingStep]  = useState(false);

  const handleSaveName = async () => {
    if (!name.trim()) return;
    setNameSaving(true);
    const updated = await api.updateInterviewPlan(plan.id, { name: name.trim(), description: desc.trim() || null });
    setNameSaving(false);
    setEditingName(false);
    onUpdated(updated);
  };

  const handleAddStep = async () => {
    if (!newStepName.trim()) return;
    setAddingStep(true);
    const updated = await api.addPlanStep(plan.id, {
      name:     newStepName.trim(),
      stage_id: newStepStage || null,
    });
    setAddingStep(false);
    setNewStepName('');
    setNewStepStage('');
    setShowAddStep(false);
    onUpdated(updated);
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete plan "${plan.name}"? This cannot be undone.`)) return;
    await api.deleteInterviewPlan(plan.id);
    onDeleted(plan.id);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Plan header */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
        {editingName ? (
          <div className="flex-1 space-y-2">
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Plan name"
            />
            <input
              value={desc}
              onChange={e => setDesc(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-500"
              placeholder="Description (optional)"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSaveName}
                disabled={nameSaving || !name.trim()}
                className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {nameSaving ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => { setEditingName(false); setName(plan.name); setDesc(plan.description || ''); }}
                className="px-3 py-1.5 bg-slate-100 text-slate-600 text-xs rounded-lg hover:bg-slate-200"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-slate-800">{plan.name}</h3>
            {plan.description && (
              <p className="text-xs text-slate-400 mt-0.5">{plan.description}</p>
            )}
            <p className="text-xs text-slate-400 mt-0.5">{plan.steps.length} step{plan.steps.length !== 1 ? 's' : ''}</p>
          </div>
        )}

        {!editingName && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setEditingName(true)}
              className="px-2.5 py-1 text-xs bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200"
            >
              Rename
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="px-2.5 py-1 text-xs bg-red-50 text-red-500 rounded-lg hover:bg-red-100"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Steps list */}
      {plan.steps.length > 0 ? (
        <div>
          {plan.steps.map((step, i) => (
            <StepRow
              key={step.id}
              step={step}
              index={i}
              total={plan.steps.length}
              stages={stages}
              planId={plan.id}
              onUpdated={onUpdated}
              onDelete={() => {}}
            />
          ))}
        </div>
      ) : (
        <p className="px-5 py-4 text-xs text-slate-400 italic">
          No steps yet — add the first interview round below.
        </p>
      )}

      {/* Add step */}
      <div className="px-4 py-3 border-t border-slate-100 bg-slate-50">
        {showAddStep ? (
          <div className="flex flex-wrap items-end gap-2">
            <input
              autoFocus
              value={newStepName}
              onChange={e => setNewStepName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddStep()}
              placeholder="e.g. Pair Coding Interview"
              className="flex-1 min-w-36 border border-slate-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
            <select
              value={newStepStage}
              onChange={e => setNewStepStage(e.target.value)}
              className="w-44 border border-slate-300 rounded-lg px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Map to stage —</option>
              {stages.filter(s => !s.is_terminal).map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleAddStep}
              disabled={addingSteep || !newStepName.trim()}
              className="px-3 py-1 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {addingSteep ? 'Adding…' : 'Add Step'}
            </button>
            <button
              type="button"
              onClick={() => { setShowAddStep(false); setNewStepName(''); setNewStepStage(''); }}
              className="px-3 py-1 bg-slate-200 text-slate-600 text-xs rounded-lg hover:bg-slate-300"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowAddStep(true)}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            + Add Step
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Main page ──────────────────────────────────────────────────── */
export default function InterviewPlans() {
  const [plans, setPlans]         = useState([]);
  const [stages, setStages]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName]     = useState('');
  const [newDesc, setNewDesc]     = useState('');
  const [creating, setCreating]   = useState(false);
  const [error, setError]         = useState('');

  const load = useCallback(async () => {
    const [p, s] = await Promise.all([api.getInterviewPlans(), api.getStages()]);
    setPlans(p);
    setStages(s);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setError('');
    setCreating(true);
    const result = await api.createInterviewPlan({ name: newName.trim(), description: newDesc.trim() || null });
    setCreating(false);
    if (result.error) { setError(result.error); return; }
    setPlans(prev => [...prev, result]);
    setNewName('');
    setNewDesc('');
    setShowCreate(false);
  };

  const handleUpdated = (updated) => {
    setPlans(prev => prev.map(p => (p.id === updated.id ? updated : p)));
  };

  const handleDeleted = (id) => {
    setPlans(prev => prev.filter(p => p.id !== id));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-slate-400 text-sm">Loading…</span>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Interview Plans</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Define the ordered interview rounds for each position type and map them to pipeline stages.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          + New Plan
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="bg-white border border-blue-200 rounded-xl px-5 py-4 mb-5 space-y-3"
        >
          <h3 className="text-sm font-semibold text-slate-700">New Interview Plan</h3>
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-48">
              <label className="block text-xs text-slate-500 mb-1">Plan name *</label>
              <input
                autoFocus
                required
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Senior Engineer"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex-1 min-w-48">
              <label className="block text-xs text-slate-500 mb-1">Description</label>
              <input
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                placeholder="Optional description"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={creating || !newName.trim()}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Create Plan'}
            </button>
            <button
              type="button"
              onClick={() => { setShowCreate(false); setNewName(''); setNewDesc(''); setError(''); }}
              className="px-4 py-2 bg-slate-100 text-slate-600 text-sm rounded-lg hover:bg-slate-200"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Plans list */}
      {plans.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 py-16 text-center">
          <p className="text-slate-400 text-sm">No interview plans yet.</p>
          <p className="text-slate-300 text-xs mt-1">Click "New Plan" to define your first interview process.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {plans.map(plan => (
            <PlanCard
              key={plan.id}
              plan={plan}
              stages={stages}
              onUpdated={handleUpdated}
              onDeleted={handleDeleted}
            />
          ))}
        </div>
      )}

      {/* Stage key */}
      {stages.filter(s => !s.is_terminal).length > 0 && (
        <div className="mt-8 bg-slate-50 border border-slate-200 rounded-xl px-5 py-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Pipeline Stages</p>
          <div className="flex flex-wrap gap-2">
            {stages.filter(s => !s.is_terminal).map(s => (
              <span
                key={s.id}
                className="px-2.5 py-1 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: (s.color || '#94a3b8') + '22',
                  color: s.color || '#64748b',
                  border: `1px solid ${(s.color || '#94a3b8')}44`,
                }}
              >
                {s.name}
              </span>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Stages are configured in Settings. Map each plan step to the stage it corresponds to.
          </p>
        </div>
      )}
    </div>
  );
}
