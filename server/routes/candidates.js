const express          = require('express');
const router           = express.Router();
const db               = require('../db');
const multer           = require('multer');
const path             = require('path');
const fs               = require('fs');
const requireHmAuth    = require('../middleware/requireHmAuth');
const requireAuth      = require('../middleware/requireAuth');
const { sendMail }     = require('../email');

/* ─── file upload setup ──────────────────────────────────────── */

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const ALLOWED_EXTS = ['.pdf', '.doc', '.docx'];

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
    if (ALLOWED_EXTS.includes(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF or Word documents are accepted'));
    }
  },
});

// In-memory multer for parse-only (no disk write)
const uploadMem = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_EXTS.includes(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF or Word documents are accepted'));
    }
  },
});

/* ─── resume text extraction & parsing ──────────────────────── */

async function extractText(buffer, ext) {
  try {
    if (ext === '.pdf') {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(buffer);
      return data.text || '';
    }
    if (ext === '.docx' || ext === '.doc') {
      const mammoth = require('mammoth');
      const result  = await mammoth.extractRawText({ buffer });
      return result.value || '';
    }
  } catch (_) { /* fall through */ }
  return '';
}

function parseResumeText(text) {
  // ── Email ────────────────────────────────────────────────────
  const emailMatch = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/);
  const email = emailMatch ? emailMatch[0].toLowerCase() : null;

  // ── LinkedIn URL ─────────────────────────────────────────────
  const liMatch = text.match(
    /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w%\-_.]+\/?/i
  );
  let linkedin_url = null;
  if (liMatch) {
    linkedin_url = liMatch[0].startsWith('http')
      ? liMatch[0].replace(/\/$/, '')
      : 'https://' + liMatch[0].replace(/\/$/, '');
  }

  // ── Name — scan the first ~20 lines for "Firstname Lastname" ─
  // Heuristic: first short line (≤ 50 chars) that looks like
  // 2–4 properly-capitalised words and isn't contact noise.
  let first_name = null;
  let last_name  = null;

  const NOISE = /@|https?:|linkedin|github|twitter|phone|address|resume|curriculum|vitae|\.(com|edu|org|io|net)\b/i;
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  for (const line of lines.slice(0, 20)) {
    if (NOISE.test(line))        continue; // looks like contact info
    if (/^\d/.test(line))        continue; // starts with a digit
    if (line.length > 50)        continue; // too long for a name
    if (line.length < 3)         continue;

    // Each word should start with a capital letter (allows hyphens/apostrophes)
    const words = line.split(/\s+/);
    if (words.length < 2 || words.length > 4) continue;
    if (!words.every(w => /^[A-ZÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞ]/.test(w))) continue;

    first_name = words[0];
    last_name  = words[words.length - 1];
    break;
  }

  return { first_name, last_name, email, linkedin_url };
}

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

// Returns a YYYY-MM-DD date string n business days from a given YYYY-MM-DD start date
function bizDaysFrom(startDateStr, n) {
  const [year, month, day] = startDateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
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
  SELECT json_group_array(json_object('id', r.id, 'req_id', r.req_id, 'title', r.title, 'sourced_by', cr.sourced_by))
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
         s.is_hm_review,
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
function setReqs(candidateId, reqIds, sourcedBy) {
  db.prepare('DELETE FROM candidate_reqs WHERE candidate_id=?').run(candidateId);
  if (reqIds && reqIds.length > 0) {
    const ins = db.prepare(
      'INSERT OR IGNORE INTO candidate_reqs (candidate_id, req_id, sourced_by) VALUES (?, ?, ?)'
    );
    reqIds.forEach(rid => ins.run(candidateId, Number(rid), sourcedBy || null));
  }
}

/* ─── routes ─────────────────────────────────────────────────── */

// POST /api/candidates/parse-resume — extract fields from a resume file (no disk write)
router.post('/parse-resume', uploadMem.single('resume'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file received' });
  const ext  = path.extname(req.file.originalname).toLowerCase();
  const text = await extractText(req.file.buffer, ext);
  if (!text.trim()) return res.json({});   // unreadable — return empty, no error
  res.json(parseResumeText(text));
});

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

// POST /api/candidates/:id/acknowledge — log an activity, reset SLA clock
// Body (all optional): { note: string, next_due: 'YYYY-MM-DD' }
router.post('/:id/acknowledge', (req, res) => {
  const row = db.prepare('SELECT id FROM candidates WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  const { note, next_due } = req.body || {};
  // next_due is the activity/event date; next_step_due is 5 biz days after it
  const dueDate = next_due ? bizDaysFrom(next_due, 5) : bizDaysFromNow(5);
  // Anchor the SLA from the activity date, not from now.
  const resetAt = next_due ? `${next_due} 12:00:00` : null;

  db.prepare(`
    UPDATE candidates
    SET sla_reset_at  = COALESCE(?, datetime('now')),
        next_step_due = ?,
        next_step     = CASE WHEN ? IS NOT NULL AND ? != '' THEN ? ELSE next_step END,
        updated_at    = datetime('now')
    WHERE id = ?
  `).run(resetAt, dueDate, note, note, note, req.params.id);

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
router.post('/', requireAuth, (req, res) => {
  const { first_name, last_name, email, stage_id,
          linkedin_url, wd_url, notes, req_ids, hired_for_req_id,
          contact_date, sourced_by } = req.body;
  if (!first_name || !stage_id) {
    return res.status(400).json({ error: 'first_name and stage_id are required' });
  }

  const stage     = db.prepare('SELECT is_hire FROM stages WHERE id=?').get(stage_id);
  const isHire    = !!stage?.is_hire;
  const hireReqId = isHire && hired_for_req_id ? Number(hired_for_req_id) : null;

  // If a past contact date is provided, back-date the SLA from that date
  const validContactDate = contact_date && /^\d{4}-\d{2}-\d{2}$/.test(contact_date) ? contact_date : null;
  const nextDue         = isHire ? null
                        : validContactDate ? bizDaysFrom(validContactDate, 5)
                        : bizDaysFromNow(5);
  const stageEnteredAt  = validContactDate
                        ? `${validContactDate}T00:00:00`
                        : new Date().toISOString();

  const tx = db.transaction(() => {
    const composed = [first_name, last_name].filter(Boolean).join(' ');
    const r = db.prepare(`
      INSERT INTO candidates
        (name, first_name, last_name, email, stage_id,
         linkedin_url, wd_url, notes,
         next_step_due, hired_for_req_id, stage_entered_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      composed,
      first_name,
      e(last_name),
      e(email),
      stage_id,
      e(linkedin_url),
      e(wd_url),
      e(notes),
      nextDue,
      hireReqId,
      stageEnteredAt
    );
    const id = r.lastInsertRowid;
    if (hireReqId) {
      db.prepare("UPDATE reqs SET status='filled' WHERE id=?").run(hireReqId);
    }
    setReqs(id, req_ids || [], sourced_by || req.user?.id);
    return id;
  });

  res.status(201).json({ id: tx() });
});

// PUT /api/candidates/:id
router.put('/:id', requireAuth, (req, res) => {
  const { first_name, last_name, email, stage_id,
          linkedin_url, wd_url, notes, req_ids, hired_for_req_id, sourced_by } = req.body;

  const existing     = db.prepare('SELECT stage_id FROM candidates WHERE id=?').get(req.params.id);
  const stageChanged = existing && Number(existing.stage_id) !== Number(stage_id);

  // Check whether the new stage is a "hire" stage
  let isHire    = false;
  let hireReqId = null;
  if (stageChanged) {
    const newStage = db.prepare('SELECT is_hire FROM stages WHERE id=?').get(stage_id);
    isHire    = !!newStage?.is_hire;
    hireReqId = isHire && hired_for_req_id ? Number(hired_for_req_id) : null;
  }

  const tx = db.transaction(() => {
    const composed = [first_name, last_name].filter(Boolean).join(' ');

    // Build the UPDATE dynamically so we can handle three cases:
    //   1. Stage didn't change     → just update fields
    //   2. Stage → hire stage      → NULL out deadline, store hired_for_req_id, auto-fill req
    //   3. Stage → non-hire stage  → reset SLA deadline, clear hired_for_req_id
    let sql    = `UPDATE candidates SET name=?, first_name=?, last_name=?,
                    email=?, stage_id=?, linkedin_url=?, wd_url=?, notes=?,
                    updated_at=datetime('now')`;
    const args = [composed, first_name, e(last_name), e(email), stage_id,
                  e(linkedin_url), e(wd_url), e(notes)];

    if (stageChanged) {
      sql += `, stage_entered_at=datetime('now'), sla_reset_at=NULL`;
      if (isHire) {
        sql += `, next_step_due=NULL, hired_for_req_id=?`;
        args.push(hireReqId);
      } else {
        sql += `, next_step_due=?, hired_for_req_id=NULL`;
        args.push(bizDaysFromNow(5));
      }
    }

    sql += ` WHERE id=?`;
    args.push(req.params.id);

    db.prepare(sql).run(...args);

    // Auto-fill the req when moving to a hire stage
    if (stageChanged && isHire && hireReqId) {
      db.prepare("UPDATE reqs SET status='filled' WHERE id=?").run(hireReqId);
    }

    if (req_ids !== undefined) setReqs(req.params.id, req_ids, sourced_by || req.user?.id);
  });

  tx();

  // Email the HM when a candidate is moved into an HM Review stage
  if (stageChanged) {
    const movedToStage = db.prepare('SELECT is_hm_review FROM stages WHERE id=?').get(stage_id);
    if (movedToStage?.is_hm_review) {
      // Get the candidate's name and linked req
      const cand    = db.prepare('SELECT first_name, last_name, name, role FROM candidates WHERE id=?').get(req.params.id);
      const candName = [cand?.first_name, cand?.last_name].filter(Boolean).join(' ') || cand?.name || 'A candidate';
      const linkedReq = db.prepare(
        'SELECT r.title, r.hiring_manager FROM reqs r JOIN candidate_reqs cr ON cr.req_id=r.id WHERE cr.candidate_id=? LIMIT 1'
      ).get(req.params.id);

      if (linkedReq?.hiring_manager) {
        const hmUser = db.prepare('SELECT name, email FROM hm_users WHERE name=?').get(linkedReq.hiring_manager);
        if (hmUser?.email) {
          // Railway auto-sets RAILWAY_PUBLIC_DOMAIN; fall back to APP_URL if manually configured
          const appUrl = process.env.APP_URL
            || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null)
            || 'https://ghostbuster.up.railway.app';
          sendMail({
            to:      hmUser.email,
            subject: `Candidate ready for your review: ${candName}`,
            text:    `Hi ${hmUser.name || 'there'},\n\n`
                   + `${candName}${cand?.role ? ` (${cand.role})` : ''} has been submitted for your review`
                   + (linkedReq.title ? ` for the ${linkedReq.title} role` : '')
                   + `.\n\nLog in to GhostBuster to review and make your decision:\n${appUrl}/hm/login\n\nThank you!`,
          }).catch(err => console.error('[candidates] Failed to email HM on review:', err));
        }
      }
    }
  }

  res.json({ success: true });
});

// PATCH /api/candidates/:id/hm-note — append a note from the HM view
router.patch('/:id/hm-note', requireHmAuth, (req, res) => {
  const row = db.prepare('SELECT id, notes FROM candidates WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  const { note, author } = req.body || {};
  if (!note?.trim()) return res.status(400).json({ error: 'Note cannot be empty' });

  const stamp   = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  const header  = `\n\n— ${author?.trim() || 'Hiring Manager'} (${stamp}) —\n`;
  const updated = (row.notes || '').trimEnd() + header + note.trim();

  db.prepare("UPDATE candidates SET notes=?, updated_at=datetime('now') WHERE id=?")
    .run(updated, req.params.id);

  res.json({ success: true });
});

// PATCH /api/candidates/:id/hm-decision — HM forwards or declines
// Body: { decision: 'forward' | 'decline' }
router.patch('/:id/hm-decision', requireHmAuth, (req, res) => {
  const { decision } = req.body || {};
  if (decision !== 'forward' && decision !== 'decline') {
    return res.status(400).json({ error: 'decision must be "forward" or "decline"' });
  }

  const candidate = db.prepare('SELECT id FROM candidates WHERE id=?').get(req.params.id);
  if (!candidate) return res.status(404).json({ error: 'Not found' });

  let targetStage;
  if (decision === 'forward') {
    // Find the next non-hm_review, non-terminal stage after the HM Review stage
    const hmStage = db.prepare('SELECT order_index FROM stages WHERE is_hm_review = 1').get();
    targetStage = db.prepare(`
      SELECT id, is_terminal FROM stages
      WHERE order_index > ? AND is_terminal = 0 AND is_hm_review = 0
      ORDER BY order_index ASC LIMIT 1
    `).get(hmStage?.order_index ?? 0);
  } else {
    // Decline: move to the terminal non-hire stage (e.g. "Rejected / Closed")
    targetStage = db.prepare(`
      SELECT id, is_terminal FROM stages
      WHERE is_terminal = 1 AND is_hire = 0
      ORDER BY order_index ASC LIMIT 1
    `).get();
  }

  if (!targetStage) {
    return res.status(500).json({ error: 'Target stage not found — check your stage configuration' });
  }

  const nextDue = targetStage.is_terminal ? null : bizDaysFromNow(5);

  db.prepare(`
    UPDATE candidates
    SET stage_id = ?, stage_entered_at = datetime('now'),
        sla_reset_at = NULL, next_step_due = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(targetStage.id, nextDue, req.params.id);

  // Log a notification for the sourcer (recruiter who submitted the candidate)
  try {
    const cInfo = db.prepare(
      'SELECT first_name, last_name, name FROM candidates WHERE id=?'
    ).get(req.params.id);
    const candName = [cInfo?.first_name, cInfo?.last_name].filter(Boolean).join(' ')
      || cInfo?.name || 'Unknown';

    // Fetch linked req AND the sourced_by user
    const linkedReq = db.prepare(`
      SELECT r.title, cr.sourced_by
      FROM reqs r
      JOIN candidate_reqs cr ON cr.req_id = r.id
      WHERE cr.candidate_id = ? LIMIT 1
    `).get(req.params.id);

    const stageName = db.prepare('SELECT name FROM stages WHERE id=?').get(targetStage.id)?.name;

    // Determine target user: sourcer first, then fall back to req recruiter
    let targetUserId = linkedReq?.sourced_by || null;
    if (!targetUserId && linkedReq?.title) {
      // Fallback: resolve req owner (recruiter field) to a user ID
      const reqRow = db.prepare(`
        SELECT u.id FROM users u
        JOIN reqs r ON r.recruiter = u.name
        JOIN candidate_reqs cr ON cr.req_id = r.id
        WHERE cr.candidate_id = ? LIMIT 1
      `).get(req.params.id);
      targetUserId = reqRow?.id || null;
    }

    db.prepare(`
      INSERT INTO notifications (type, candidate_id, candidate_name, req_title, stage_name, decision, target_user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      decision === 'forward' ? 'hm_forward' : 'hm_decline',
      req.params.id,
      candName,
      linkedReq?.title || null,
      stageName || null,
      decision,
      targetUserId
    );

    // Email the sourcer about the HM decision
    if (targetUserId) {
      const sourcer = db.prepare('SELECT name, email FROM users WHERE id=?').get(targetUserId);
      if (sourcer?.email) {
        const verb = decision === 'forward' ? 'forwarded' : 'declined';
        sendMail({
          to:      sourcer.email,
          subject: `HM Decision: ${candName} — ${decision === 'forward' ? 'Forward' : 'Decline'}`,
          text:    `Hi ${sourcer.name || 'there'},\n\n`
                 + `A hiring manager has ${verb} ${candName}`
                 + (linkedReq?.title ? ` for ${linkedReq.title}` : '')
                 + `.\n\nLog in to GhostBuster to see the details.`,
        }).catch(err => console.error('[candidates] Failed to email sourcer:', err));
      }
    }
  } catch (_) { /* notifications are best-effort — never block the response */ }

  res.json({ success: true, stage_id: targetStage.id });
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

// GET /api/candidates/:id/resume — serve resume inline (opens in browser tab)
router.get('/:id/resume', (req, res) => {
  const row = db.prepare('SELECT resume_path, resume_original_name FROM candidates WHERE id=?').get(req.params.id);
  if (!row?.resume_path) return res.status(404).json({ error: 'No resume on file' });

  const filePath = path.join(UPLOADS_DIR, row.resume_path);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

  const ext = path.extname(row.resume_path).toLowerCase();
  const mime = {
    '.pdf':  'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc':  'application/msword',
  };

  const originalName = row.resume_original_name || row.resume_path;
  res.setHeader('Content-Type', mime[ext] || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${originalName}"`);
  res.sendFile(filePath);
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

/* ─── video screen notes ────────────────────────────────────── */

// GET /api/candidates/:id/video-notes
router.get('/:id/video-notes', requireHmAuth, (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM video_screen_notes WHERE candidate_id = ? ORDER BY created_at DESC'
  ).all(req.params.id);
  res.json(rows);
});

// POST /api/candidates/:id/video-notes
router.post('/:id/video-notes', (req, res) => {
  const row = db.prepare('SELECT id FROM candidates WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  const { note, author } = req.body;
  if (!note?.trim()) return res.status(400).json({ error: 'note is required' });

  const r = db.prepare(
    'INSERT INTO video_screen_notes (candidate_id, note, author) VALUES (?, ?, ?)'
  ).run(req.params.id, note.trim(), author?.trim() || null);

  res.status(201).json({ id: r.lastInsertRowid });
});

/* ─── candidate scores ──────────────────────────────────────── */

// GET /api/candidates/:id/scores?req_id=
router.get('/:id/scores', (req, res) => {
  const { req_id } = req.query;
  if (!req_id) return res.status(400).json({ error: 'req_id query parameter is required' });

  const rows = db.prepare(`
    SELECT sc.id as criterion_id, sc.name as criterion_name, sc.order_index,
           cs.score, cs.scored_by, cs.scored_at
    FROM   scorecard_criteria sc
    LEFT JOIN candidate_scores cs
      ON cs.criterion_id = sc.id
      AND cs.candidate_id = ?
      AND cs.req_id = ?
    WHERE sc.req_id = ?
    ORDER BY sc.order_index, sc.id
  `).all(req.params.id, req_id, req_id);

  res.json(rows);
});

// PUT /api/candidates/:id/scores
router.put('/:id/scores', (req, res) => {
  const { req_id, scores, scored_by } = req.body;
  if (!req_id || !Array.isArray(scores)) {
    return res.status(400).json({ error: 'req_id and scores array are required' });
  }

  const upsert = db.prepare(`
    INSERT INTO candidate_scores (candidate_id, req_id, criterion_id, score, scored_by, scored_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(candidate_id, req_id, criterion_id)
    DO UPDATE SET score = excluded.score, scored_by = excluded.scored_by, scored_at = datetime('now')
  `);

  const tx = db.transaction(() => {
    for (const { criterion_id, score } of scores) {
      if (score >= 1 && score <= 5) {
        upsert.run(req.params.id, req_id, criterion_id, score, scored_by || null);
      }
    }
  });
  tx();
  res.json({ success: true });
});

module.exports = router;
