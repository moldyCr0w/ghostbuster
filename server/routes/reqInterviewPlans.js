const express     = require('express');
const router      = express.Router({ mergeParams: true }); // mergeParams to access :reqId
const db          = require('../db');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');

// Helper — fetch plan entries for a req with joined names
function getPlan(reqId) {
  return db.prepare(`
    SELECT p.*, s.name AS stage_name, s.color AS stage_color, s.order_index AS stage_order,
           it.name AS interview_type_name
    FROM   req_interview_plans p
    JOIN   stages s ON s.id = p.stage_id
    LEFT JOIN interview_types it ON it.id = p.interview_type_id
    WHERE  p.req_id = ?
    ORDER  BY s.order_index, p.order_index
  `).all(reqId);
}

// GET /api/reqs/:reqId/interview-plan — any authenticated user
router.get('/', requireAuth, (req, res) => {
  res.json(getPlan(req.params.reqId));
});

// POST /api/reqs/:reqId/interview-plan — senior_recruiter+
router.post('/', requireAuth, requireRole('senior_recruiter'), (req, res) => {
  const { reqId } = req.params;
  const { stage_id, interview_name, interview_type_id, notes } = req.body;
  if (!stage_id)               return res.status(400).json({ error: 'stage_id is required' });
  if (!interview_name?.trim()) return res.status(400).json({ error: 'interview_name is required' });

  const maxOrder = db.prepare(
    'SELECT MAX(order_index) as m FROM req_interview_plans WHERE req_id = ?'
  ).get(reqId).m ?? 0;

  try {
    const r = db.prepare(`
      INSERT INTO req_interview_plans (req_id, stage_id, interview_name, interview_type_id, notes, order_index)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(reqId, stage_id, interview_name.trim(), interview_type_id || null, notes || null, maxOrder + 1);
    res.status(201).json({ id: r.lastInsertRowid });
  } catch (err) {
    if (err.message.includes('UNIQUE'))
      return res.status(400).json({ error: 'This stage already has an interview plan entry for this req' });
    throw err;
  }
});

// PUT /api/reqs/:reqId/interview-plan/:entryId — senior_recruiter+
router.put('/:entryId', requireAuth, requireRole('senior_recruiter'), (req, res) => {
  const { reqId, entryId } = req.params;
  const { stage_id, interview_name, interview_type_id, notes } = req.body;
  if (!interview_name?.trim()) return res.status(400).json({ error: 'interview_name is required' });

  const existing = db.prepare('SELECT id FROM req_interview_plans WHERE id = ? AND req_id = ?').get(entryId, reqId);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  try {
    db.prepare(`
      UPDATE req_interview_plans
      SET stage_id=?, interview_name=?, interview_type_id=?, notes=?
      WHERE id = ? AND req_id = ?
    `).run(stage_id, interview_name.trim(), interview_type_id || null, notes || null, entryId, reqId);
    res.json({ success: true });
  } catch (err) {
    if (err.message.includes('UNIQUE'))
      return res.status(400).json({ error: 'This stage already has an interview plan entry for this req' });
    throw err;
  }
});

// DELETE /api/reqs/:reqId/interview-plan/:entryId — senior_recruiter+
router.delete('/:entryId', requireAuth, requireRole('senior_recruiter'), (req, res) => {
  const { reqId, entryId } = req.params;
  const result = db.prepare('DELETE FROM req_interview_plans WHERE id = ? AND req_id = ?').run(entryId, reqId);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

module.exports = router;
