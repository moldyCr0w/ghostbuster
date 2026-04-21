const express     = require('express');
const router      = express.Router();
const db          = require('../db');
const requireAuth = require('../middleware/requireAuth');
const crypto      = require('crypto');
const requireRole = require('../middleware/requireRole');

// GET /api/reqs  — any authenticated user can list reqs
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT r.*,
           COUNT(DISTINCT cr.candidate_id)                                       AS candidate_count,
           COUNT(DISTINCT ws.id)                                                  AS total_hc,
           COUNT(DISTINCT CASE WHEN ws.status = 'open' THEN ws.id END)           AS open_hc
    FROM   reqs r
    LEFT JOIN candidate_reqs cr ON cr.req_id = r.id
    LEFT JOIN req_wd_slots   ws ON ws.req_id = r.id
    GROUP BY r.id
    ORDER BY r.req_id
  `).all();
  res.json(rows);
});

// POST /api/reqs  — senior_recruiter+
router.post('/', requireAuth, requireRole('senior_recruiter'), (req, res) => {
  const { title, department, status, hiring_manager, recruiter, script_doc_url, job_description, plan_id, priority } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });
  // Auto-generate an internal req_id — never shown in the UI
  const req_id = crypto.randomBytes(4).toString('hex').toUpperCase();
  try {
    const r = db.prepare(
      'INSERT INTO reqs (req_id, title, department, status, hiring_manager, recruiter, script_doc_url, job_description, plan_id, priority) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(req_id, title.trim(), department || null, status || 'open', hiring_manager || null, recruiter || null, script_doc_url || null, job_description || null, plan_id ? Number(plan_id) : null, priority || 'medium');
    res.status(201).json({ id: r.lastInsertRowid });
  } catch (err) {
    throw err;
  }
});

// PUT /api/reqs/:id  — senior_recruiter+
router.put('/:id', requireAuth, requireRole('senior_recruiter'), (req, res) => {
  const { req_id, title, department, status, hiring_manager, recruiter, script_doc_url, job_description, is_public, plan_id, priority } = req.body;
  if (!req_id || !title) return res.status(400).json({ error: 'req_id and title are required' });
  try {
    // Auto-generate a public token when making a req public for the first time.
    const existing = db.prepare('SELECT public_token FROM reqs WHERE id = ?').get(req.params.id);
    let token = existing?.public_token;
    if (is_public && !token) {
      token = crypto.randomBytes(16).toString('hex');
    }
    db.prepare(
      'UPDATE reqs SET req_id=?, title=?, department=?, status=?, hiring_manager=?, recruiter=?, script_doc_url=?, job_description=?, is_public=?, public_token=COALESCE(?, public_token), plan_id=?, priority=? WHERE id=?'
    ).run(req_id.trim(), title.trim(), department || null, status || 'open', hiring_manager || null, recruiter || null, script_doc_url || null, job_description || null, is_public ? 1 : 0, token || null, plan_id ? Number(plan_id) : null, priority || 'medium', req.params.id);
    const updated = db.prepare('SELECT public_token FROM reqs WHERE id = ?').get(req.params.id);
    res.json({ success: true, public_token: updated?.public_token || null });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(400).json({ error: `Req ID "${req_id}" already exists` });
    throw err;
  }
});

// DELETE /api/reqs/:id  — senior_recruiter+
router.delete('/:id', requireAuth, requireRole('senior_recruiter'), (req, res) => {
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

// GET /api/reqs/:id/scorecard  — any authenticated user
router.get('/:id/scorecard', (req, res) => {
  const criteria = db.prepare(
    'SELECT * FROM scorecard_criteria WHERE req_id = ? ORDER BY order_index, id'
  ).all(req.params.id);
  res.json(criteria);
});

// POST /api/reqs/:id/scorecard  — senior_recruiter+
router.post('/:id/scorecard', requireAuth, requireRole('senior_recruiter'), (req, res) => {
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

// PUT /api/reqs/:id/scorecard/:criterionId  — senior_recruiter+
router.put('/:id/scorecard/:criterionId', requireAuth, requireRole('senior_recruiter'), (req, res) => {
  const { name, order_index } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  db.prepare(
    'UPDATE scorecard_criteria SET name = ?, order_index = ? WHERE id = ? AND req_id = ?'
  ).run(name.trim(), order_index ?? 0, req.params.criterionId, req.params.id);
  res.json({ success: true });
});

// DELETE /api/reqs/:id/scorecard/:criterionId  — senior_recruiter+
router.delete('/:id/scorecard/:criterionId', requireAuth, requireRole('senior_recruiter'), (req, res) => {
  db.prepare(
    'DELETE FROM scorecard_criteria WHERE id = ? AND req_id = ?'
  ).run(req.params.criterionId, req.params.id);
  res.json({ success: true });
});

/* ─── Workday HC slots ──────────────────────────────────────────────────── */

// GET /api/reqs/:id/wd-slots
router.get('/:id/wd-slots', (req, res) => {
  const slots = db.prepare(`
    SELECT ws.*, c.first_name, c.last_name, c.name as candidate_name
    FROM   req_wd_slots ws
    LEFT JOIN candidates c ON c.id = ws.candidate_id
    WHERE  ws.req_id = ?
    ORDER BY ws.created_at ASC
  `).all(req.params.id);
  res.json(slots);
});

// POST /api/reqs/:id/wd-slots  — add a new HC slot (senior_recruiter+)
router.post('/:id/wd-slots', requireRole('senior_recruiter'), (req, res) => {
  const { wd_req_id, label } = req.body || {};
  if (!wd_req_id?.trim()) return res.status(400).json({ error: 'wd_req_id is required' });

  const r = db.prepare(`
    INSERT INTO req_wd_slots (req_id, wd_req_id, label)
    VALUES (?, ?, ?)
  `).run(req.params.id, wd_req_id.trim(), label?.trim() || null);

  res.status(201).json({ id: r.lastInsertRowid });
});

// PATCH /api/reqs/:id/wd-slots/:slotId  — update label or status (senior_recruiter+)
router.patch('/:id/wd-slots/:slotId', requireRole('senior_recruiter'), (req, res) => {
  const { label, status } = req.body || {};
  const allowed = ['open', 'pushed', 'filled'];
  if (status && !allowed.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
  }
  db.prepare(`
    UPDATE req_wd_slots
    SET label = COALESCE(?, label),
        status = COALESCE(?, status)
    WHERE id = ? AND req_id = ?
  `).run(label?.trim() ?? null, status ?? null, req.params.slotId, req.params.id);
  res.json({ success: true });
});

// DELETE /api/reqs/:id/wd-slots/:slotId  — remove a slot (senior_recruiter+, only if open)
router.delete('/:id/wd-slots/:slotId', requireRole('senior_recruiter'), (req, res) => {
  const slot = db.prepare('SELECT id, status FROM req_wd_slots WHERE id = ? AND req_id = ?')
    .get(req.params.slotId, req.params.id);
  if (!slot) return res.status(404).json({ error: 'Slot not found' });
  if (slot.status !== 'open') {
    return res.status(400).json({ error: 'Cannot delete a slot that has already been pushed or filled' });
  }
  db.prepare('DELETE FROM req_wd_slots WHERE id = ?').run(req.params.slotId);
  res.json({ success: true });
});

module.exports = router;
