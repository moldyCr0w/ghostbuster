const express = require('express');
const router  = express.Router();
const db      = require('../db');

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM stages ORDER BY order_index').all());
});

router.post('/', (req, res) => {
  const { name, color, is_terminal } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const maxOrder = db.prepare('SELECT MAX(order_index) as m FROM stages').get().m || 0;
  const r = db.prepare(
    'INSERT INTO stages (name, order_index, color, is_terminal) VALUES (?, ?, ?, ?)'
  ).run(name, maxOrder + 1, color || '#6B7280', is_terminal ? 1 : 0);
  res.status(201).json({ id: r.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const { name, color, order_index, is_terminal } = req.body;
  db.prepare(
    'UPDATE stages SET name=?, color=?, order_index=?, is_terminal=? WHERE id=?'
  ).run(name, color || '#6B7280', order_index, is_terminal ? 1 : 0, req.params.id);
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  const inUse = db.prepare('SELECT COUNT(*) as c FROM candidates WHERE stage_id=?').get(req.params.id).c;
  if (inUse > 0) return res.status(400).json({ error: `Cannot delete — ${inUse} candidate(s) are in this stage` });
  db.prepare('DELETE FROM stages WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
