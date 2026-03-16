const express = require('express');
const router  = express.Router();
const db      = require('../db');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

/* ─── file upload setup ──────────────────────────────────────── */

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename:    (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.pdf';
    cb(null, `resume_${req.params.id}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF or Word documents are accepted'));
    }
  },
});

/* ─── helpers ────────────────────────────────────────────────── */

function e(v) { return v || null; }

function pad(n) { return String(n).padStart(2, '0'); }

function localDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Returns a YYYY-MM-DD date string n business days from today
function bizDaysFromNow(n) {
  const d = new Date();
  let added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return localDateStr(d);
}

// Compose display name from first/last
function fullName(row) {
  return [row.first_name, row.last_name].filter(Boolean).join(' ') || row.name || '';
}

// Subquery that returns a candidate's linked reqs as a JSON array
const REQS_SUB = `(
  SELECT json_group_array(json_object('id', r.id, 'req_id', r.req_id, 'title', r.title))
  FROM   candidate_reqs cr
  JOIN   reqs r ON r.id = cr.req_id
  WHERE  cr.candidate_id = c.id
)`;

const WITH_STAGE = `
  SELECT c.*,
         TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')) as display_name,
         s.name        as stage_name,
         s.color       as stage_color,
         s.order_index,
         s.is_terminal,
         ${REQS_SUB}   as reqs_json
  FROM   candidates c
  JOIN   stages s ON c.stage_id = s.id
`;

function parseRow(row) {
  row.reqs = row.reqs_json ? JSON.parse(row.reqs_json) : [];
  delete row.reqs_json;
  // Ensure display_name is always populated
  if (!row.display_name || !row.display_name.trim()) {
    row.display_name = row.name || '';
  }
  return row;
}

// Replace all req associations for a candidate
function setReqs(candidateId, reqIds) {
  db.prepare('DELETE FROM candidate_reqs WHERE candidate_id=?').run(candidateId);
  if (reqIds && reqIds.length > 0) {
    const ins = db.prepare(
      'INSERT OR IGNORE INTO candidate_reqs (candidate_id, req_id) VALUES (?, ?)'
    );
    reqIds.forEach(rid => ins.run(candidateId, Number(rid)));
  }
}

/* ─── routes ─────────────────────────────────────────────────── */

// GET /api/candidates/reminders — flat array; client groups into sections
router.get('/reminders', (req, res) => {
  const rows = db.prepare(
    WITH_STAGE + ' WHERE s.is_terminal = 0 ORDER BY c.next_step_due ASC NULLS LAST, c.first_name'
  ).all().map(parseRow);
  res.json(rows);
});

// GET /api/candidates?stage_id=
router.get('/', (req, res) => {
  const { stage_id } = req.query;
  const rows = stage_id
    ? db.prepare(WITH_STAGE + ' WHERE c.stage_id = ? ORDER BY c.first_name').all(stage_id)
    : db.prepare(WITH_STAGE + ' ORDER BY s.order_index, c.first_name').all();
  res.json(rows.map(parseRow));
});

// POST /api/candidates/:id/acknowledge — reset SLA clock + due date
router.post('/:id/acknowledge', (req, res) => {
  const row = db.prepare('SELECT id FROM candidates WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  db.prepare(`
    UPDATE candidates
    SET sla_reset_at=datetime('now'),
        next_step_due=?,
        updated_at=datetime('now')
    WHERE id=?
  `).run(bizDaysFromNow(5), req.params.id);
  res.json({ success: true });
});

// GET /api/candidates/:id
router.get('/:id', (req, res) => {
  const row = db.prepare(WITH_STAGE + ' WHERE c.id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(parseRow(row));
});

// GET /api/candidates/:id/reqs
router.get('/:id/reqs', (req, res) => {
  res.json(db.prepare(`
    SELECT r.* FROM reqs r
    JOIN candidate_reqs cr ON cr.req_id = r.id
    WHERE cr.candidate_id = ? ORDER BY r.req_id
  `).all(req.params.id));
});

// PUT /api/candidates/:id/reqs
router.put('/:id/reqs', (req, res) => {
  setReqs(req.params.id, req.body.req_ids || []);
  res.json({ success: true });
});

// POST /api/candidates
router.post('/', (req, res) => {
  const { first_name, last_name, email, stage_id,
          linkedin_url, wd_url, notes, req_ids } = req.body;
  if (!first_name || !stage_id) {
    return res.status(400).json({ error: 'first_name and stage_id are required' });
  }

  const tx = db.transaction(() => {
    const composed = [first_name, last_name].filter(Boolean).join(' ');
    const r = db.prepare(`
      INSERT INTO candidates
        (name, first_name, last_name, email, stage_id,
         linkedin_url, wd_url, notes,
         next_step_due, stage_entered_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      composed,
      first_name,
      e(last_name),
      e(email),
      stage_id,
      e(linkedin_url),
      e(wd_url),
      e(notes),
      bizDaysFromNow(5)   // auto-set SLA deadline
    );
    const id = r.lastInsertRowid;
    setReqs(id, req_ids || []);
    return id;
  });

  res.status(201).json({ id: tx() });
});

// PUT /api/candidates/:id
router.put('/:id', (req, res) => {
  const { first_name, last_name, email, stage_id,
          linkedin_url, wd_url, notes, req_ids } = req.body;

  const existing = db.prepare('SELECT stage_id FROM candidates WHERE id=?').get(req.params.id);
  const stageChanged = existing && Number(existing.stage_id) !== Number(stage_id);

  const tx = db.transaction(() => {
    const composed = [first_name, last_name].filter(Boolean).join(' ');
    db.prepare(`
      UPDATE candidates
      SET name=?, first_name=?, last_name=?,
          email=?, stage_id=?,
          linkedin_url=?, wd_url=?, notes=?,
          updated_at=datetime('now')
          ${stageChanged
            ? ", stage_entered_at=datetime('now'), sla_reset_at=NULL, next_step_due=?"
            : ''}
      WHERE id=?
    `).run(
      ...(stageChanged
        ? [composed, first_name, e(last_name), e(email), stage_id,
           e(linkedin_url), e(wd_url), e(notes),
           bizDaysFromNow(5),           // auto-reset deadline on stage change
           req.params.id]
        : [composed, first_name, e(last_name), e(email), stage_id,
           e(linkedin_url), e(wd_url), e(notes),
           req.params.id])
    );

    if (req_ids !== undefined) setReqs(req.params.id, req_ids);
  });

  tx();
  res.json({ success: true });
});

// DELETE /api/candidates/:id
router.delete('/:id', (req, res) => {
  // Clean up resume file if present
  const row = db.prepare('SELECT resume_path FROM candidates WHERE id=?').get(req.params.id);
  if (row?.resume_path) {
    try { fs.unlinkSync(path.join(UPLOADS_DIR, row.resume_path)); } catch (_) {}
  }
  db.prepare('DELETE FROM candidates WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// POST /api/candidates/:id/resume — upload or replace resume file
router.post('/:id/resume', upload.single('resume'), (req, res) => {
  const row = db.prepare('SELECT id, resume_path FROM candidates WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (!req.file) return res.status(400).json({ error: 'No file received' });

  // Remove old file if it exists and the name has changed (e.g. different extension)
  if (row.resume_path && row.resume_path !== req.file.filename) {
    try { fs.unlinkSync(path.join(UPLOADS_DIR, row.resume_path)); } catch (_) {}
  }

  db.prepare(`
    UPDATE candidates
    SET resume_path=?, resume_original_name=?, updated_at=datetime('now')
    WHERE id=?
  `).run(req.file.filename, req.file.originalname, req.params.id);

  res.json({ success: true, resume_path: req.file.filename, resume_original_name: req.file.originalname });
});

// DELETE /api/candidates/:id/resume — remove resume file
router.delete('/:id/resume', (req, res) => {
  const row = db.prepare('SELECT id, resume_path FROM candidates WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  if (row.resume_path) {
    try { fs.unlinkSync(path.join(UPLOADS_DIR, row.resume_path)); } catch (_) {}
  }

  db.prepare(`
    UPDATE candidates
    SET resume_path=NULL, resume_original_name=NULL, updated_at=datetime('now')
    WHERE id=?
  `).run(req.params.id);

  res.json({ success: true });
});

module.exports = router;
