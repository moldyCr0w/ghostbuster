/**
 * HM 24-hour reminder job.
 *
 * Finds candidates that have been sitting in an HM Review stage for ≥ 24 hours
 * without a decision, and emails the linked hiring manager if we haven't already
 * sent a reminder this cycle. The reminder resets when the candidate leaves the
 * HM Review stage (hm_reminder_sent_at is cleared in the PUT route on stage change).
 */

const db         = require('./db');
const { sendMail } = require('./email');

async function sendHmReminders() {
  const hmStage = db.prepare("SELECT id, name FROM stages WHERE is_hm_review = 1").get();
  if (!hmStage) return;

  const appUrl = process.env.APP_URL
    || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null)
    || 'https://ghostbuster.up.railway.app';

  // Find candidates in HM Review for ≥ 24h with no reminder sent yet
  const overdue = db.prepare(`
    SELECT
      c.id,
      COALESCE(
        NULLIF(TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')), ''),
        c.name
      ) AS candidate_name,
      c.role,
      c.stage_entered_at
    FROM candidates c
    WHERE c.stage_id = ?
      AND c.hm_reminder_sent_at IS NULL
      AND c.stage_entered_at <= datetime('now', '-24 hours')
  `).all(hmStage.id);

  if (overdue.length === 0) return;

  for (const cand of overdue) {
    // Find linked req + HM
    const linkedReq = db.prepare(`
      SELECT r.title, r.hiring_manager
      FROM   reqs r
      JOIN   candidate_reqs cr ON cr.req_id = r.id
      WHERE  cr.candidate_id = ?
      LIMIT  1
    `).get(cand.id);

    if (!linkedReq?.hiring_manager) continue;

    const hmUser = db.prepare('SELECT name, email FROM hm_users WHERE name = ?').get(linkedReq.hiring_manager);
    if (!hmUser?.email) continue;

    const candDesc = cand.candidate_name + (cand.role ? ` (${cand.role})` : '');
    const reqDesc  = linkedReq.title ? ` for the ${linkedReq.title} role` : '';

    await sendMail({
      to:      hmUser.email,
      subject: `Reminder: Candidate awaiting your review — ${cand.candidate_name}`,
      text:
        `Hi ${hmUser.name || 'there'},\n\n` +
        `This is a reminder that ${candDesc} has been waiting for your review${reqDesc} for more than 24 hours.\n\n` +
        `Please log in to GhostBuster to forward or decline:\n${appUrl}/hm/login\n\n` +
        `Thank you!`,
    }).catch(err => console.error('[reminders] Failed to email HM reminder:', err.message));

    // Mark reminder sent so we don't send again until the candidate moves stages
    db.prepare("UPDATE candidates SET hm_reminder_sent_at = datetime('now') WHERE id = ?").run(cand.id);
    console.log(`[reminders] Sent 24h HM reminder for candidate ${cand.id} (${cand.candidate_name}) to ${hmUser.email}`);
  }
}

module.exports = { sendHmReminders };
