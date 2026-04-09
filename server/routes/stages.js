const express     = require('express');
const router      = express.Router();
const db          = require('../db');
const requireAuth   = require('../middleware/requireAuth');
const requireHmAuth = require('../middleware/requireHmAuth');
const requireRole   = require('../middleware/requireRole');

// GET /api/stages  — any authenticated user (recruiters or HMs)
router.get('/', requireHmAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM stages ORDER BY order_index').all());
});

// POST /api/stages  — admin only
router.post('/', requireAuth, requireRole('admin'), (req, res) => {
  const { name, color, is_terminal, is_hire } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const maxOrder = db.prepare('SELECT MAX(order_index) as m FROM stages').get().m || 0;
  const r = db.prepare(
    'INSERT INTO stages (name, order_index, color, is_terminal, is_hire) VALUES (?, ?, ?, ?, ?)'
  ).run(name, maxOrder + 1, color || '#6B7280', is_terminal ? 1 : 0, is_hire ? 1 : 0);
  res.status(201).json({ id: r.lastInsertRowid });
});

// PUT /api/stages/:id  — admin only
router.put('/:id', requireAuth, requireRole('admin'), (req, res) => {
  const { name, color, order_index, is_terminal, is_hire } = req.body;
  db.prepare(
    'UPDATE stages SET name=?, color=?, order_index=?, is_terminal=?, is_hire=? WHERE id=?'
  ).run(name, color || '#6B7280', order_index, is_terminal ? 1 : 0, is_hire ? 1 : 0, req.params.id);
  res.json({ success: true });
});

// DELETE /api/stages/:id  — admin only
router.delete('/:id', requireAuth, requireRole('admin'), (req, res) => {
  const inUse = db.prepare('SELECT COUNT(*) as c FROM candidates WHERE stage_id=?').get(req.params.id).c;
  if (inUse > 0) return res.status(400).json({ error: `Cannot delete — ${inUse} candidate(s) are in this stage` });
  db.prepare('DELETE FROM stages WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
