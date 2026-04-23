const express = require('express');
const crypto  = require('crypto');
const db      = require('../db');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

// GET /api/screens/candidate/:cid — all screens for a candidate (recruiter)
router.get('/candidate/:cid', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT vs.*, r.title AS req_title, r.req_id AS req_code,
           c.name AS candidate_name
    FROM   video_screens vs
    JOIN   reqs r ON r.id = vs.req_id
    JOIN   candidates c ON c.id = vs.candidate_id
    WHERE  vs.candidate_id = ?
    ORDER  BY vs.created_at DESC
  `).all(req.params.cid);
  res.json(rows);
});

// GET /api/screens/req/:rid — all screens for a req (pipeline health)
router.get('/req/:rid', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT vs.*,
           COALESCE(
             NULLIF(TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')), ''),
             c.name
           ) AS candidate_name
    FROM   video_screens vs
    JOIN   candidates c ON c.id = vs.candidate_id
    WHERE  vs.req_id = ?
    ORDER  BY vs.created_at DESC
  `).all(req.params.rid);
  res.json(rows);
});

// GET /api/screens/all — all screens for all reqs (pipeline health bulk fetch)
router.get('/all', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT vs.*,
           COALESCE(
             NULLIF(TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')), ''),
             c.name
           ) AS candidate_name,
           r.title AS req_title
    FROM   video_screens vs
    JOIN   candidates c ON c.id = vs.candidate_id
    JOIN   reqs r ON r.id = vs.req_id
    ORDER  BY vs.created_at DESC
  `).all();
  res.json(rows);
});

// POST /api/screens — create screen
router.post('/', requireAuth, (req, res) => {
  const { candidate_id, req_id, summary, created_by } = req.body;
  if (!candidate_id || !req_id) return res.status(400).json({ error: 'candidate_id and req_id required' });

  const token = crypto.randomUUID();
  try {
    const result = db.prepare(`
      INSERT INTO video_screens (candidate_id, req_id, summary, share_token, created_by)
      VALUES (?, ?, ?, ?, ?)
    `).run(candidate_id, req_id, summary || null, token, created_by || null);
    const row = db.prepare('SELECT * FROM video_screens WHERE id = ?').get(result.lastInsertRowid);
    res.json(row);
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      // Already exists — return existing
      const row = db.prepare('SELECT * FROM video_screens WHERE candidate_id = ? AND req_id = ?').get(candidate_id, req_id);
      res.json(row);
    } else {
      res.status(500).json({ error: e.message });
    }
  }
});

// PUT /api/screens/:id — update summary
router.put('/:id', requireAuth, (req, res) => {
  const { summary } = req.body;
  db.prepare(`UPDATE video_screens SET summary = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(summary ?? null, req.params.id);
  res.json(db.prepare('SELECT * FROM video_screens WHERE id = ?').get(req.params.id));
});

// DELETE /api/screens/:id
router.delete('/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM video_screens WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// GET /api/screens/share/:token — public, for HM review page
router.get('/share/:token', (req, res) => {
  const row = db.prepare(`
    SELECT vs.id, vs.summary, vs.hm_decision, vs.hm_name, vs.hm_notes, vs.decided_at,
           vs.created_by, vs.created_at,
           COALESCE(
             NULLIF(TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')), ''),
             c.name
           ) AS candidate_name,
           c.role AS candidate_role,
           r.title AS req_title, r.req_id AS req_code
    FROM   video_screens vs
    JOIN   candidates c ON c.id = vs.candidate_id
    JOIN   reqs r ON r.id = vs.req_id
    WHERE  vs.share_token = ?
  `).get(req.params.token);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

// PATCH /api/screens/share/:token/decision — public, HM submits go/no-go
router.patch('/share/:token/decision', (req, res) => {
  const { hm_decision, hm_name, hm_notes } = req.body;
  if (!['go', 'no_go'].includes(hm_decision)) return res.status(400).json({ error: 'hm_decision must be go or no_go' });

  const row = db.prepare('SELECT * FROM video_screens WHERE share_token = ?').get(req.params.token);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.hm_decision) return res.status(409).json({ error: 'Decision already recorded' });

  db.prepare(`
    UPDATE video_screens
    SET hm_decision = ?, hm_name = ?, hm_notes = ?, decided_at = datetime('now'), updated_at = datetime('now')
    WHERE share_token = ?
  `).run(hm_decision, hm_name || null, hm_notes || null, req.params.token);

  res.json(db.prepare('SELECT * FROM video_screens WHERE share_token = ?').get(req.params.token));
});

module.exports = router;
