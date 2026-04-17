const express    = require('express');
const router     = express.Router();
const db         = require('../db');
const requireAuth = require('../middleware/requireAuth');
const { sendMail } = require('../email');

// All routes require auth
router.use(requireAuth);

/* ── helpers ─────────────────────────────────────────────── */

function enrichRequest(row) {
  try { row.availability = JSON.parse(row.availability || '[]'); } catch { row.availability = []; }
  return row;
}

// Notify all coordinators by email
async function notifyCoordinators(request) {
  const coordinators = db.prepare(
    "SELECT name, email FROM users WHERE role = 'coordinator'"
  ).all();

  if (coordinators.length === 0) return;

  const candidateName = request.candidate_name || 'Unknown Candidate';
  const stageName     = request.stage_name     || 'Unknown Stage';
  const reqTitle      = request.req_title       ? ` (${request.req_title})` : '';
  const submittedBy   = request.submitted_by_name || 'a recruiter';

  const subject = `New Scheduling Request: ${candidateName}`;
  const text = [
    `A new scheduling request has been submitted by ${submittedBy}.`,
    '',
    `Candidate: ${candidateName}${reqTitle}`,
    `Stage:     ${stageName}`,
    request.notes ? `Notes:     ${request.notes}` : null,
    '',
    'Log in to GhostBuster to view and action this request.',
  ].filter(l => l !== null).join('\n');

  await Promise.allSettled(
    coordinators.map(c => sendMail({ to: c.email, subject, text }))
  );
}

/* ── GET / — list all scheduling requests ─────────────────── */
router.get('/', (req, res) => {
  const { role, id: userId } = req.user;
  const isCoordOrAdmin = role === 'coordinator' || role === 'admin';

  // Coordinators and admins see all; recruiters/senior_recruiters see their own
  const rows = isCoordOrAdmin
    ? db.prepare(`
        SELECT
          sr.*,
          COALESCE(NULLIF(TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')), ''), c.name) AS candidate_name,
          c.email AS candidate_email,
          s.name  AS stage_name,
          r.title AS req_title,
          r.req_id AS req_number,
          u.name  AS submitted_by_name,
          coord.name AS coordinator_name
        FROM scheduling_requests sr
        JOIN candidates c ON c.id = sr.candidate_id
        LEFT JOIN stages s ON s.id = sr.stage_id
        LEFT JOIN reqs r   ON r.id = sr.req_id
        LEFT JOIN users u  ON u.id = sr.submitted_by
        LEFT JOIN users coord ON coord.id = sr.coordinator_id
        ORDER BY sr.created_at DESC
      `).all()
    : db.prepare(`
        SELECT
          sr.*,
          COALESCE(NULLIF(TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')), ''), c.name) AS candidate_name,
          c.email AS candidate_email,
          s.name  AS stage_name,
          r.title AS req_title,
          r.req_id AS req_number,
          u.name  AS submitted_by_name,
          coord.name AS coordinator_name
        FROM scheduling_requests sr
        JOIN candidates c ON c.id = sr.candidate_id
        LEFT JOIN stages s ON s.id = sr.stage_id
        LEFT JOIN reqs r   ON r.id = sr.req_id
        LEFT JOIN users u  ON u.id = sr.submitted_by
        LEFT JOIN users coord ON coord.id = sr.coordinator_id
        WHERE sr.submitted_by = ?
        ORDER BY sr.created_at DESC
      `).all(userId);

  res.json(rows.map(enrichRequest));
});

/* ── POST / — create a new scheduling request ─────────────── */
router.post('/', async (req, res) => {
  const { candidate_id, req_id, stage_id, availability, notes } = req.body;

  if (!candidate_id) return res.status(400).json({ error: 'candidate_id is required' });
  if (!availability || !Array.isArray(availability) || availability.length === 0) {
    return res.status(400).json({ error: 'At least one availability window is required' });
  }

  const result = db.prepare(`
    INSERT INTO scheduling_requests
      (candidate_id, req_id, stage_id, availability, notes, submitted_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    candidate_id,
    req_id   || null,
    stage_id || null,
    JSON.stringify(availability),
    notes    || null,
    req.user.id
  );

  // Fetch the created row with joined data for the response + email
  const created = db.prepare(`
    SELECT
      sr.*,
      COALESCE(NULLIF(TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')), ''), c.name) AS candidate_name,
      c.email AS candidate_email,
      s.name  AS stage_name,
      r.title AS req_title,
      r.req_id AS req_number,
      u.name  AS submitted_by_name,
      coord.name AS coordinator_name
    FROM scheduling_requests sr
    JOIN candidates c ON c.id = sr.candidate_id
    LEFT JOIN stages s ON s.id = sr.stage_id
    LEFT JOIN reqs r   ON r.id = sr.req_id
    LEFT JOIN users u  ON u.id = sr.submitted_by
    LEFT JOIN users coord ON coord.id = sr.coordinator_id
    WHERE sr.id = ?
  `).get(result.lastInsertRowid);

  // Fire-and-forget email to coordinators
  notifyCoordinators(created).catch(err =>
    console.error('[scheduling-requests] coordinator email error:', err.message)
  );

  res.status(201).json(enrichRequest(created));
});

/* ── PATCH /:id — update status / coordinator / interview_date ── */
router.patch('/:id', (req, res) => {
  const { role } = req.user;
  const id = Number(req.params.id);

  const existing = db.prepare('SELECT * FROM scheduling_requests WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  // Recruiters can only update their own and only to cancel
  if (role === 'recruiter' || role === 'senior_recruiter') {
    if (existing.submitted_by !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }

  const allowed = ['status', 'coordinator_id', 'interview_date', 'notes'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No updatable fields provided' });
  }

  updates.updated_at = new Date().toISOString();

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE scheduling_requests SET ${setClauses} WHERE id = ?`)
    .run(...Object.values(updates), id);

  const updated = db.prepare(`
    SELECT
      sr.*,
      COALESCE(NULLIF(TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')), ''), c.name) AS candidate_name,
      c.email AS candidate_email,
      s.name  AS stage_name,
      r.title AS req_title,
      r.req_id AS req_number,
      u.name  AS submitted_by_name,
      coord.name AS coordinator_name
    FROM scheduling_requests sr
    JOIN candidates c ON c.id = sr.candidate_id
    LEFT JOIN stages s ON s.id = sr.stage_id
    LEFT JOIN reqs r   ON r.id = sr.req_id
    LEFT JOIN users u  ON u.id = sr.submitted_by
    LEFT JOIN users coord ON coord.id = sr.coordinator_id
    WHERE sr.id = ?
  `).get(id);

  res.json(enrichRequest(updated));
});

/* ── DELETE /:id — admin only ──────────────────────────────── */
router.delete('/:id', (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden — admin only' });
  }

  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM scheduling_requests WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  db.prepare('DELETE FROM scheduling_requests WHERE id = ?').run(id);
  res.json({ ok: true });
});

module.exports = router;
