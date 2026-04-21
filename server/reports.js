/**
 * Daily interview report.
 *
 * Runs once per day (≥ 08:00 server time). Finds all candidates whose
 * stage_event_date (the interview date set on the Board card) was yesterday,
 * then emails every coordinator a table of name / position / stage so they
 * can log into Workday and confirm feedback has been provided.
 *
 * Uses the settings table (key = 'daily_report_last_sent') to ensure the
 * email is sent exactly once per calendar day even if the server restarts.
 */

const db           = require('./db');
const { sendMail } = require('./email');

/* ── HTML escaping ───────────────────────────────────────────────────── */
function escHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── Main export ─────────────────────────────────────────────────────── */
async function sendDailyInterviewReport() {
  // Guard: only send once per calendar day
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const lastSent = db.prepare(
    "SELECT value FROM settings WHERE key = 'daily_report_last_sent'"
  ).get();
  if (lastSent?.value === today) return;

  // Mark sent immediately — prevents double-send if called concurrently
  db.prepare(
    "INSERT OR REPLACE INTO settings (key, value) VALUES ('daily_report_last_sent', ?)"
  ).run(today);

  // Yesterday's date string (YYYY-MM-DD) matching stage_event_date format
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  // Find candidates whose interview date was yesterday.
  // GROUP_CONCAT aggregates all linked req titles into a comma-separated string.
  const rows = db.prepare(`
    SELECT
      COALESCE(
        NULLIF(TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')), ''),
        c.name
      ) AS candidate_name,
      s.name AS stage_name,
      GROUP_CONCAT(r.title, ', ') AS req_titles
    FROM candidates c
    LEFT JOIN stages s          ON s.id  = c.stage_id
    LEFT JOIN candidate_reqs cr ON cr.candidate_id = c.id
    LEFT JOIN reqs r            ON r.id  = cr.req_id
    WHERE c.stage_event_date = ?
    GROUP BY c.id
    ORDER BY candidate_name
  `).all(yesterdayStr);

  if (rows.length === 0) {
    console.log(`[reports] No interviews on ${yesterdayStr} — skipping daily report email`);
    return;
  }

  const coordinators = db.prepare(
    "SELECT name, email FROM users WHERE role = 'coordinator' OR role = 'admin'"
  ).all();

  if (coordinators.length === 0) {
    console.log('[reports] No coordinators found — skipping daily report email');
    return;
  }

  const dateLabel = yesterday.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const subject = `Daily Interview Report — ${dateLabel}`;

  /* ── Plain-text body ── */
  const text = [
    `Interview Report for ${dateLabel}`,
    '─'.repeat(50),
    '',
    `${rows.length} candidate${rows.length !== 1 ? 's' : ''} interviewed yesterday.`,
    'Please log in to Workday and confirm that feedback has been provided for each candidate below.',
    '',
    rows.map(r =>
      `  • ${r.candidate_name}  |  ${r.req_titles || '(No position)'}  |  ${r.stage_name || 'Unknown stage'}`
    ).join('\n'),
    '',
    '— GhostBuster',
  ].join('\n');

  /* ── HTML body ── */
  const tableRows = rows.map(r => `
    <tr>
      <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:14px;">${escHtml(r.candidate_name)}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:14px;">${escHtml(r.req_titles || '—')}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:14px;">${escHtml(r.stage_name || '—')}</td>
    </tr>`).join('');

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:640px;margin:0 auto;color:#1e293b;">
      <div style="background:#1e293b;padding:20px 28px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;color:#fff;font-size:18px;font-weight:600;">
          GhostBuster — Daily Interview Report
        </h2>
        <p style="margin:4px 0 0;color:#94a3b8;font-size:13px;">${escHtml(dateLabel)}</p>
      </div>

      <div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;padding:24px 28px;">
        <p style="margin:0 0 16px;font-size:14px;color:#475569;">
          ${rows.length} candidate${rows.length !== 1 ? 's' : ''} interviewed yesterday.
          Please log in to <strong>Workday</strong> and confirm that feedback has been provided for each candidate below.
        </p>

        <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="text-align:left;padding:10px 14px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e2e8f0;">
                Candidate
              </th>
              <th style="text-align:left;padding:10px 14px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e2e8f0;">
                Position
              </th>
              <th style="text-align:left;padding:10px 14px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e2e8f0;">
                Stage
              </th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>

        <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;">— GhostBuster</p>
      </div>
    </div>`;

  await Promise.allSettled(
    coordinators.map(c => sendMail({ to: c.email, subject, text, html }))
  );

  console.log(
    `[reports] Sent daily interview report for ${yesterdayStr} ` +
    `to ${coordinators.length} coordinator(s) — ${rows.length} interviewee(s)`
  );
}

module.exports = { sendDailyInterviewReport };
