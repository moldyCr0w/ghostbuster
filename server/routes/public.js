const express  = require('express');
const router   = express.Router();
const db       = require('../db');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const { sendMail } = require('../email');

/* ─── resume upload for applications ────────────────────────── */

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const ALLOWED_EXTS = ['.pdf', '.doc', '.docx'];

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename:    (_req, file, cb) => {
      const ext  = path.extname(file.originalname).toLowerCase() || '.pdf';
      const stem = `app_${Date.now()}`;
      cb(null, `${stem}${ext}`);
    },
  }),
  limits:     { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_EXTS.includes(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF or Word documents are accepted'));
    }
  },
});

/* ─── GET /api/public/jobs ───────────────────────────────────── */
// Returns all public, open jobs for the careers hub listing.

router.get('/jobs', (_req, res) => {
  const rows = db.prepare(
    `SELECT req_id, title, department, public_token
     FROM reqs
     WHERE is_public = 1 AND status = 'open'
     ORDER BY id DESC`
  ).all();
  res.json(rows);
});

/* ─── GET /api/public/jobs/:token ────────────────────────────── */
// Returns job details for the public posting page (no auth required).

router.get('/jobs/:token', (req, res) => {
  const row = db.prepare(
    'SELECT id, req_id, title, department, job_description, status, is_public FROM reqs WHERE public_token = ?'
  ).get(req.params.token);

  if (!row || !row.is_public) return res.status(404).json({ error: 'Job not found' });

  res.json({
    req_id:          row.req_id,
    title:           row.title,
    department:      row.department,
    job_description: row.job_description,
    status:          row.status,
  });
});

/* ─── POST /api/public/jobs/:token/apply ─────────────────────── */
// Creates a candidate record and links them to the req.
// Accepts multipart/form-data (resume file optional).

router.post('/jobs/:token/apply', upload.single('resume'), (req, res) => {
  const row = db.prepare(
    'SELECT id, req_id, title, status, is_public FROM reqs WHERE public_token = ?'
  ).get(req.params.token);

  if (!row || !row.is_public) return res.status(404).json({ error: 'Job not found' });
  if (row.status !== 'open')  return res.status(400).json({ error: 'This position is no longer accepting applications' });

  const { first_name, last_name, email, linkedin_url } = req.body;
  if (!first_name?.trim() || !last_name?.trim()) {
    return res.status(400).json({ error: 'First and last name are required' });
  }
  if (!email?.trim()) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const fullName        = `${first_name.trim()} ${last_name.trim()}`;

  // Find the first active (non-terminal) stage to place the applicant in.
  const firstStage = db.prepare(
    'SELECT id FROM stages WHERE is_terminal = 0 ORDER BY order_index ASC LIMIT 1'
  ).get();
  if (!firstStage) return res.status(500).json({ error: 'No pipeline stages configured' });

  let resumePath         = null;
  let resumeOriginalName = null;
  if (req.file) {
    resumePath         = req.file.filename;
    resumeOriginalName = req.file.originalname;
  }

  try {
    const apply = db.transaction(() => {
      // Upsert: find existing candidate by email or create new one.
      let candidate = db.prepare(
        'SELECT id FROM candidates WHERE LOWER(email) = ?'
      ).get(normalizedEmail);

      if (!candidate) {
        const ins = db.prepare(`
          INSERT INTO candidates
            (name, first_name, last_name, email, stage_id, linkedin_url, resume_path, resume_original_name,
             stage_entered_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))
        `);
        const r = ins.run(
          fullName,
          first_name.trim(),
          last_name.trim(),
          normalizedEmail,
          firstStage.id,
          linkedin_url?.trim() || null,
          resumePath,
          resumeOriginalName,
        );
        candidate = { id: r.lastInsertRowid };
      } else {
        // Update resume if provided for existing candidate.
        if (resumePath) {
          db.prepare(
            'UPDATE candidates SET resume_path = ?, resume_original_name = ?, updated_at = datetime(\'now\') WHERE id = ?'
          ).run(resumePath, resumeOriginalName, candidate.id);
        }
      }

      // Check if already linked to this req.
      const existing = db.prepare(
        'SELECT 1 FROM candidate_reqs WHERE candidate_id = ? AND req_id = ?'
      ).get(candidate.id, row.id);

      if (existing) {
        return { alreadyApplied: true };
      }

      db.prepare(
        'INSERT INTO candidate_reqs (candidate_id, req_id) VALUES (?, ?)'
      ).run(candidate.id, row.id);

      return { candidateId: candidate.id };
    });

    const result = apply();

    if (result.alreadyApplied) {
      return res.status(409).json({ error: 'You have already applied for this position' });
    }

    res.status(201).json({ success: true, message: 'Application received — thank you!' });

    // Send confirmation email (non-blocking — don't let failures affect the response)
    sendMail({
      to:      normalizedEmail,
      subject: `Application received — ${row.title}`,
      text: [
        `Hi ${first_name.trim()},`,
        '',
        `Thanks for applying for the ${row.title} position${row.department ? ` (${row.department})` : ''} at Stord. We've received your application and will be in touch if your background is a match.`,
        '',
        'Best,',
        'The Stord Talent Team',
      ].join('\n'),
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#1e293b">
          <p>Hi ${first_name.trim()},</p>
          <p>Thanks for applying for the <strong>${row.title}</strong>${row.department ? ` (${row.department})` : ''} position at Stord. We've received your application and will be in touch if your background is a match.</p>
          <p style="margin-top:24px">Best,<br>The Stord Talent Team</p>
        </div>
      `,
    }).catch(err => console.error('[public apply] confirmation email failed:', err));
  } catch (err) {
    console.error('[public apply]', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;
