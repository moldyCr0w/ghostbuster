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
  const { req_id, title, department, status, hiring_manager, recruiter, script_doc_url } = req.body;
  if (!req_id || !title) return res.status(400).json({ error: 'req_id and title are required' });
  try {
    const r = db.prepare(
      'INSERT INTO reqs (req_id, title, department, status, hiring_manager, recruiter, script_doc_url) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(req_id.trim(), title.trim(), department || null, status || 'open', hiring_manager || null, recruiter || null, script_doc_url || null);
    res.status(201).json({ id: r.lastInsertRowid });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(400).json({ error: `Req ID "${req_id}" already exists` });
    throw err;
  }
});

// PUT /api/reqs/:id
router.put('/:id', (req, res) => {
  const { req_id, title, department, status, hiring_manager, recruiter, script_doc_url } = req.body;
  if (!req_id || !title) return res.status(400).json({ error: 'req_id and title are required' });
  try {
    db.prepare(
      'UPDATE reqs SET req_id=?, title=?, department=?, status=?, hiring_manager=?, recruiter=?, script_doc_url=? WHERE id=?'
    ).run(req_id.trim(), title.trim(), department || null, status || 'open', hiring_manager || null, recruiter || null, script_doc_url || null, req.params.id);
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

/* ─── scorecard criteria ────────────────────────────────────── */

// GET /api/reqs/:id/scorecard
router.get('/:id/scorecard', (req, res) => {
  const criteria = db.prepare(
    'SELECT * FROM scorecard_criteria WHERE req_id = ? ORDER BY order_index, id'
  ).all(req.params.id);
  res.json(criteria);
});

// POST /api/reqs/:id/scorecard
router.post('/:id/scorecard', (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  const maxOrder = db.prepare(
    'SELECT MAX(order_index) as m FROM scorecard_criteria WHERE req_id = ?'
  ).get(req.params.id).m ?? 0;
  const r = db.prepare(
    'INSERT INTO scorecard_criteria (req_id, name, order_index) VALUES (?, ?, ?)'
  ).run(req.params.id, name.trim(), maxOrder + 1);
  res.status(201).json({ id: r.lastInsertRowid });
});

// PUT /api/reqs/:id/scorecard/:criterionId
router.put('/:id/scorecard/:criterionId', (req, res) => {
  const { name, order_index } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  db.prepare(
    'UPDATE scorecard_criteria SET name = ?, order_index = ? WHERE id = ? AND req_id = ?'
  ).run(name.trim(), order_index ?? 0, req.params.criterionId, req.params.id);
  res.json({ success: true });
});

// DELETE /api/reqs/:id/scorecard/:criterionId
router.delete('/:id/scorecard/:criterionId', (req, res) => {
  db.prepare(
    'DELETE FROM scorecard_criteria WHERE id = ? AND req_id = ?'
  ).run(req.params.criterionId, req.params.id);
  res.json({ success: true });
});

module.exports = router;
