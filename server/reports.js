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
// Returns YYYY-MM-DD for a given Date object in America/New_York.
// Railway's OS clock is UTC — using toISOString() would give the wrong date
// after 8 pm Eastern. The Intl API handles DST automatically.
function easternDateStr(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  return `${parts.find(p => p.type === 'year').value}-${parts.find(p => p.type === 'month').value}-${parts.find(p => p.type === 'day').value}`;
}

async function sendDailyInterviewReport() {
  // Guard: only send once per calendar day (Eastern time)
  const today = easternDateStr();
  const lastSent = db.prepare(
    "SELECT value FROM settings WHERE key = 'daily_report_last_sent'"
  ).get();
  if (lastSent?.value === today) return;

  // Only fire on weekdays. Saturday (6) and Sunday (0) are skipped entirely.
  const DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const weekdayStr = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' }).format(new Date());
  const dowEastern = DOW[weekdayStr];
  if (dowEastern === 0 || dowEastern === 6) {
    console.log('[reports] Weekend — skipping daily report');
    return;
  }

  // Mark sent immediately — prevents double-send if called concurrently
  db.prepare(
    "INSERT OR REPLACE INTO settings (key, value) VALUES ('daily_report_last_sent', ?)"
  ).run(today);

  // Look back to the previous business day: Monday reports Friday's interviews.
  const lookbackDays = dowEastern === 1 ? 3 : 1;
  const yesterdayStr = easternDateStr(new Date(Date.now() - lookbackDays * 864e5));

  // Find candidates whose interview date was the last business day,
  // restricted to HM Review and later stages (phone/video screens excluded).
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
      AND s.order_index >= (SELECT order_index FROM stages WHERE is_hm_review = 1 LIMIT 1)
    GROUP BY c.id
    ORDER BY candidate_name
  `).all(yesterdayStr);

  if (rows.length === 0) {
    console.log(`[reports] No interviews on ${yesterdayStr} — skipping daily report email`);
    return;
  }

  const recipients = db.prepare(
    'SELECT name, email FROM users'
  ).all();

  if (recipients.length === 0) {
    console.log('[reports] No users found — skipping daily report email');
    return;
  }

  const dateLabel = new Date(Date.now() - lookbackDays * 864e5).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'America/New_York',
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
    recipients.map(c => sendMail({ to: c.email, subject, text, html }))
  );

  console.log(
    `[reports] Sent daily interview report for ${yesterdayStr} ` +
    `to ${recipients.length} user(s) — ${rows.length} interviewee(s)`
  );
}

module.exports = { sendDailyInterviewReport };
