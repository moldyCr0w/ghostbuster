const express     = require('express');
const router      = express.Router();
const db          = require('../db');
const requireAuth = require('../middleware/requireAuth');

const VALID_LEVELS = ['senior', 'staff_plus'];

function expandType(it) {
  const tag = it.required_tag_id
    ? db.prepare('SELECT * FROM panelist_tags WHERE id = ?').get(it.required_tag_id)
    : null;
  return { ...it, required_tag: tag };
}

// GET /api/interview-types
router.get('/', requireAuth, (_req, res) => {
  const rows = db.prepare('SELECT * FROM interview_types ORDER BY order_index, name').all();
  res.json(rows.map(expandType));
});

// POST /api/interview-types
router.post('/', requireAuth, (req, res) => {
  const {
    name, duration_mins = 60,
    level_requirement = 'senior',
    required_tag_id = null,
    min_panelists = 2,
  } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  if (!VALID_LEVELS.includes(level_requirement))
    return res.status(400).json({ error: 'level_requirement must be senior or staff_plus' });

  const maxOrder = db.prepare('SELECT MAX(order_index) as m FROM interview_types').get().m || 0;
  try {
    const r = db.prepare(`
      INSERT INTO interview_types (name, duration_mins, level_requirement, required_tag_id, min_panelists, order_index)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(name.trim(), duration_mins, level_requirement, required_tag_id || null, min_panelists, maxOrder + 1);
    res.json(expandType(db.prepare('SELECT * FROM interview_types WHERE id = ?').get(r.lastInsertRowid)));
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'An interview type with that name already exists' });
    throw e;
  }
});

// PUT /api/interview-types/:id
router.put('/:id', requireAuth, (req, res) => {
  const existing = db.prepare('SELECT * FROM interview_types WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const {
    name              = existing.name,
    duration_mins     = existing.duration_mins,
    level_requirement = existing.level_requirement,
    required_tag_id   = existing.required_tag_id,
    min_panelists     = existing.min_panelists,
    order_index       = existing.order_index,
  } = req.body;

  if (!VALID_LEVELS.includes(level_requirement))
    return res.status(400).json({ error: 'level_requirement must be senior or staff_plus' });

  try {
    db.prepare(`
      UPDATE interview_types
      SET name=?, duration_mins=?, level_requirement=?, required_tag_id=?, min_panelists=?, order_index=?
      WHERE id=?
    `).run(name.trim(), duration_mins, level_requirement, required_tag_id || null, min_panelists, order_index, req.params.id);
    res.json(expandType(db.prepare('SELECT * FROM interview_types WHERE id = ?').get(req.params.id)));
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'An interview type with that name already exists' });
    throw e;
  }
});

// DELETE /api/interview-types/:id
router.delete('/:id', requireAuth, (req, res) => {
  const result = db.prepare('DELETE FROM interview_types WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = router;
