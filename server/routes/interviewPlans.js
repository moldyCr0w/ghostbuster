const express      = require('express');
const router       = express.Router();
const db           = require('../db');
const requireAuth  = require('../middleware/requireAuth');

// All routes require a logged-in recruiter session
router.use(requireAuth);

/* ── Helpers ─────────────────────────────────────────────────── */

function planWithSteps(planId) {
  const plan = db.prepare('SELECT * FROM interview_plans WHERE id = ?').get(planId);
  if (!plan) return null;
  plan.steps = db.prepare(
    'SELECT s.*, st.name as stage_name, st.color as stage_color FROM interview_plan_steps s LEFT JOIN stages st ON st.id = s.stage_id WHERE s.plan_id = ? ORDER BY s.order_index, s.id'
  ).all(planId);
  return plan;
}

/* ── Plans CRUD ──────────────────────────────────────────────── */

// GET /api/interview-plans
router.get('/', (req, res) => {
  const plans = db.prepare('SELECT * FROM interview_plans ORDER BY name').all();
  plans.forEach(p => {
    p.steps = db.prepare(
      'SELECT s.*, st.name as stage_name, st.color as stage_color FROM interview_plan_steps s LEFT JOIN stages st ON st.id = s.stage_id WHERE s.plan_id = ? ORDER BY s.order_index, s.id'
    ).all(p.id);
  });
  res.json(plans);
});

// GET /api/interview-plans/:id
router.get('/:id', (req, res) => {
  const plan = planWithSteps(req.params.id);
  if (!plan) return res.status(404).json({ error: 'Not found' });
  res.json(plan);
});

// POST /api/interview-plans
router.post('/', (req, res) => {
  const { name, description } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  try {
    const r = db.prepare(
      "INSERT INTO interview_plans (name, description) VALUES (?, ?)"
    ).run(name.trim(), description?.trim() || null);
    res.status(201).json(planWithSteps(r.lastInsertRowid));
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'A plan with that name already exists' });
    throw e;
  }
});

// PUT /api/interview-plans/:id
router.put('/:id', (req, res) => {
  const { name, description } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  const existing = db.prepare('SELECT id FROM interview_plans WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  try {
    db.prepare("UPDATE interview_plans SET name = ?, description = ? WHERE id = ?")
      .run(name.trim(), description?.trim() || null, req.params.id);
    res.json(planWithSteps(req.params.id));
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'A plan with that name already exists' });
    throw e;
  }
});

// DELETE /api/interview-plans/:id
router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM interview_plans WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  // Clear plan_id on any reqs that referenced this plan
  db.prepare('UPDATE reqs SET plan_id = NULL WHERE plan_id = ?').run(req.params.id);
  db.prepare('DELETE FROM interview_plans WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

/* ── Steps CRUD ──────────────────────────────────────────────── */

// POST /api/interview-plans/:id/steps
router.post('/:id/steps', (req, res) => {
  const plan = db.prepare('SELECT id FROM interview_plans WHERE id = ?').get(req.params.id);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });

  const { name, stage_id, order_index } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

  // Default order: append after existing steps
  const maxOrder = db.prepare(
    'SELECT COALESCE(MAX(order_index), -1) as m FROM interview_plan_steps WHERE plan_id = ?'
  ).get(req.params.id).m;

  const idx = order_index != null ? Number(order_index) : maxOrder + 1;

  db.prepare(
    'INSERT INTO interview_plan_steps (plan_id, order_index, name, stage_id) VALUES (?, ?, ?, ?)'
  ).run(req.params.id, idx, name.trim(), stage_id ? Number(stage_id) : null);

  res.status(201).json(planWithSteps(req.params.id));
});

// PUT /api/interview-plans/:id/steps/:stepId
router.put('/:id/steps/:stepId', (req, res) => {
  const step = db.prepare('SELECT id FROM interview_plan_steps WHERE id = ? AND plan_id = ?').get(req.params.stepId, req.params.id);
  if (!step) return res.status(404).json({ error: 'Step not found' });

  const { name, stage_id, order_index } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

  db.prepare(
    'UPDATE interview_plan_steps SET name = ?, stage_id = ?, order_index = ? WHERE id = ?'
  ).run(name.trim(), stage_id ? Number(stage_id) : null, order_index != null ? Number(order_index) : 0, req.params.stepId);

  res.json(planWithSteps(req.params.id));
});

// DELETE /api/interview-plans/:id/steps/:stepId
router.delete('/:id/steps/:stepId', (req, res) => {
  const step = db.prepare('SELECT id FROM interview_plan_steps WHERE id = ? AND plan_id = ?').get(req.params.stepId, req.params.id);
  if (!step) return res.status(404).json({ error: 'Step not found' });

  db.prepare('DELETE FROM interview_plan_steps WHERE id = ?').run(req.params.stepId);
  res.json(planWithSteps(req.params.id));
});

// PUT /api/interview-plans/:id/steps/reorder  — body: { order: [stepId, stepId, ...] }
router.put('/:id/steps/reorder', (req, res) => {
  const plan = db.prepare('SELECT id FROM interview_plans WHERE id = ?').get(req.params.id);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });

  const { order } = req.body || {};
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array of step IDs' });

  const upd = db.prepare('UPDATE interview_plan_steps SET order_index = ? WHERE id = ? AND plan_id = ?');
  const tx  = db.transaction(() => {
    order.forEach((stepId, idx) => upd.run(idx, stepId, req.params.id));
  });
  tx();

  res.json(planWithSteps(req.params.id));
});

module.exports = router;
