const express = require('express');
const router  = express.Router();
const db      = require('../db');

// GET /api/reqs  — list all with candidate count
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT r.*, COUNT(cr.candidate_id) as candidate_count
    FROM   reqs r
    LEFT JOIN candidate_reqs cr ON cr.req_id = r.id
    GROUP BY r.id
    ORDER BY r.req_id
  `).all();
  res.json(rows);
});

// POST /api/reqs
router.post('/', (req, res) => {
  const { req_id, title, department, status } = req.body;
  if (!req_id || !title) return res.status(400).json({ error: 'req_id and title are required' });
  try {
    const r = db.prepare(
      'INSERT INTO reqs (req_id, title, department, status) VALUES (?, ?, ?, ?)'
    ).run(req_id.trim(), title.trim(), department || null, status || 'open');
    res.status(201).json({ id: r.lastInsertRowid });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(400).json({ error: `Req ID "${req_id}" already exists` });
    throw err;
  }
});

// PUT /api/reqs/:id
router.put('/:id', (req, res) => {
  const { req_id, title, department, status } = req.body;
  if (!req_id || !title) return res.status(400).json({ error: 'req_id and title are required' });
  try {
    db.prepare(
      'UPDATE reqs SET req_id=?, title=?, department=?, status=? WHERE id=?'
    ).run(req_id.trim(), title.trim(), department || null, status || 'open', req.params.id);
    res.json({ success: true });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(400).json({ error: `Req ID "${req_id}" already exists` });
    throw err;
  }
});

// DELETE /api/reqs/:id
router.delete('/:id', (req, res) => {
  const linked = db.prepare(
    'SELECT COUNT(*) as c FROM candidate_reqs WHERE req_id=?'
  ).get(req.params.id).c;
  if (linked > 0) {
    return res.status(400).json({ error: `Cannot delete — ${linked} candidate(s) linked to this req` });
  }
  db.prepare('DELETE FROM reqs WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
