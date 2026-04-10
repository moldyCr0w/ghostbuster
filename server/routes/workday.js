const express     = require('express');
const router      = express.Router();
const path        = require('path');
const db          = require('../db');
const requireAuth = require('../middleware/requireAuth');
const wd          = require('../utils/workday');

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '..', '..', 'uploads');

// ── Shared push logic ────────────────────────────────────────────────────────

async function executePush(candidateId, wdReqId, slotId) {
  const candidate = db.prepare(`
    SELECT c.*, s.name as stage_name
    FROM   candidates c
    JOIN   stages s ON c.stage_id = s.id
    WHERE  c.id = ?
  `).get(candidateId);

  if (!candidate) throw Object.assign(new Error('Candidate not found'), { statusCode: 404 });

  // Mark in-flight
  db.prepare(`
    UPDATE candidates SET wd_sync_status = 'pending', wd_sync_error = NULL, updated_at = datetime('now')
    WHERE id = ?
  `).run(candidateId);

  // ── Resolve or create Workday candidate profile ─────────────────────────
  let wdApplicantId = candidate.wd_applicant_id || null;

  if (!wdApplicantId && candidate.email) {
    const existing = await wd.findCandidateByEmail(candidate.email);
    if (existing?.id) wdApplicantId = existing.id;
  }

  if (!wdApplicantId) {
    wdApplicantId = await wd.createCandidate(candidate);
  }

  // ── Upload resume if on file (non-fatal) ────────────────────────────────
  if (candidate.resume_path) {
    const fullPath    = path.join(UPLOADS_DIR, candidate.resume_path);
    const displayName = candidate.resume_original_name || candidate.resume_path;
    try {
      await wd.uploadResume(wdApplicantId, fullPath, displayName);
    } catch (resumeErr) {
      console.warn(`[workday] Resume upload failed for candidate ${candidateId}:`, resumeErr.message);
    }
  }

  // ── Create job application ───────────────────────────────────────────────
  await wd.createJobApplication(wdApplicantId, wdReqId);

  const now = new Date().toISOString();

  // ── Persist result on candidate ──────────────────────────────────────────
  db.prepare(`
    UPDATE candidates
    SET wd_applicant_id  = ?,
        wd_sync_status   = 'synced',
        wd_synced_at     = ?,
        wd_sync_error    = NULL,
        wd_pushed_req_id = ?,
        updated_at       = datetime('now')
    WHERE id = ?
  `).run(wdApplicantId, now, wdReqId, candidateId);

  // ── Mark HC slot as pushed ───────────────────────────────────────────────
  if (slotId) {
    db.prepare(`
      UPDATE req_wd_slots
      SET status = 'pushed', candidate_id = ?, pushed_at = ?
      WHERE id = ?
    `).run(Number(candidateId), now, slotId);
  }

  return { wd_applicant_id: wdApplicantId };
}

// ── GET /api/workday/status ─────────────────────────────────────────────────
router.get('/status', requireAuth, async (_req, res) => {
  const configured = !!(
    process.env.WORKDAY_CLIENT_ID &&
    process.env.WORKDAY_CLIENT_SECRET &&
    process.env.WORKDAY_TOKEN_URL &&
    process.env.WORKDAY_API_BASE_URL
  );

  if (!configured) {
    return res.json({ connected: false, reason: 'Workday env vars not set' });
  }

  try {
    await wd.testConnection();
    res.json({ connected: true });
  } catch (err) {
    res.json({ connected: false, reason: err.message });
  }
});

// ── POST /api/workday/push/:candidateId ─────────────────────────────────────
// Body: { wd_req_id: string, slot_id?: number }
router.post('/push/:candidateId', requireAuth, async (req, res) => {
  const { wd_req_id, slot_id } = req.body || {};
  if (!wd_req_id?.trim()) return res.status(400).json({ error: 'wd_req_id is required' });

  try {
    const result = await executePush(Number(req.params.candidateId), wd_req_id.trim(), slot_id || null);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error(`[workday] Push failed for candidate ${req.params.candidateId}:`, err.message);
    // Store error on candidate if it exists
    try {
      db.prepare(`
        UPDATE candidates SET wd_sync_status = 'failed', wd_sync_error = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(err.message, req.params.candidateId);
    } catch (_) {}
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ── POST /api/workday/retry/:candidateId ────────────────────────────────────
// Body: { wd_req_id: string, slot_id?: number }
router.post('/retry/:candidateId', requireAuth, async (req, res) => {
  const { wd_req_id, slot_id } = req.body || {};
  if (!wd_req_id?.trim()) return res.status(400).json({ error: 'wd_req_id is required' });

  try {
    const result = await executePush(Number(req.params.candidateId), wd_req_id.trim(), slot_id || null);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error(`[workday] Retry failed for candidate ${req.params.candidateId}:`, err.message);
    try {
      db.prepare(`
        UPDATE candidates SET wd_sync_status = 'failed', wd_sync_error = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(err.message, req.params.candidateId);
    } catch (_) {}
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

module.exports = router;
