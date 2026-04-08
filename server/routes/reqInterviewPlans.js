const express     = require('express');
const router      = express.Router({ mergeParams: true });
const db          = require('../db');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');

// GET /api/reqs/:reqId/interview-plan
router.get('/', requireAuth, (req, res) => {
  const entries = db.prepare(`
    SELECT rip.id, rip.req_id, rip.stage_id, rip.interview_name,
           rip.interview_type_id, rip.notes, rip.order_index,
           s.name AS stage_name, s.color AS stage_color,
           it.name AS interview_type_name
    FROM req_interview_plans rip
    JOIN stages s ON s.id = rip.stage_id
    LEFT JOIN interview_types it ON it.id = rip.interview_type_id
    WHERE rip.req_id = ?
    ORDER BY rip.order_index, rip.id
  `).all(req.params.reqId);
  res.json(entries);
});

// POST /api/reqs/:reqId/interview-plan
router.post('/', requireAuth, requireRole('senior_recruiter'), (req, res) => {
  const { stage_id, interview_name, interview_type_id, notes, order_index } = req.body;
  if (!stage_id || !interview_name) {
    return res.status(400).json({ error: 'stage_id and interview_name are required' });
  }
  try {
    const r = db.prepare(`
      INSERT INTO req_interview_plans
        (req_id, stage_id, interview_name, interview_type_id, notes, order_index)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      req.params.reqId,
      stage_id,
      interview_name,
      interview_type_id || null,
      notes || null,
      order_index ?? 0
    );
    res.status(201).json({ id: r.lastInsertRowid });
  } catch (err) {
    if (err.message?.includes('UNIQUE')) {
      return res.status(409).json({ error: 'An entry for this stage already exists in this req\'s plan' });
    }
    throw err;
  }
});

// PUT /api/reqs/:reqId/interview-plan/:entryId
router.put('/:entryId', requireAuth, requireRole('senior_recruiter'), (req, res) => {
  const { interview_name, interview_type_id, notes, order_index } = req.body;
  if (!interview_name) return res.status(400).json({ error: 'interview_name is required' });
  const result = db.prepare(`
    UPDATE req_interview_plans
    SET interview_name=?, interview_type_id=?, notes=?, order_index=?
    WHERE id=? AND req_id=?
  `).run(
    interview_name,
    interview_type_id || null,
    notes || null,
    order_index ?? 0,
    req.params.entryId,
    req.params.reqId
  );
  if (result.changes === 0) return res.status(404).json({ error: 'Entry not found' });
  res.json({ success: true });
});

// DELETE /api/reqs/:reqId/interview-plan/:entryId
router.delete('/:entryId', requireAuth, requireRole('senior_recruiter'), (req, res) => {
  const result = db.prepare(
    'DELETE FROM req_interview_plans WHERE id=? AND req_id=?'
  ).run(req.params.entryId, req.params.reqId);
  if (result.changes === 0) return res.status(404).json({ error: 'Entry not found' });
  res.json({ success: true });
});

module.exports = router;
