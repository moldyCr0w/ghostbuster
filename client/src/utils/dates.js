/* ── Calendar helpers ─────────────────────────────────────── */

export function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Adds n calendar days to today's date string
export function calendarDaysFromToday(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Calendar days until a YYYY-MM-DD string (negative = overdue)
export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const today  = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 864e5);
}

export function relativeLabel(dateStr) {
  const d = daysUntil(dateStr);
  if (d === null) return null;
  if (d < -1)  return `${Math.abs(d)} days overdue`;
  if (d === -1) return '1 day overdue';
  if (d === 0)  return 'Due today';
  if (d === 1)  return 'Due tomorrow';
  return `Due in ${d} days`;
}

export function shortDate(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

/* ── SLA / Business-day helpers ──────────────────────────── */

// Add n business days (Mon–Fri) to a Date object, returns a new Date
export function addBizDays(date, n) {
  const d = new Date(date);
  let added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay(); // 0=Sun, 6=Sat
    if (dow !== 0 && dow !== 6) added++;
  }
  return d;
}

/**
 * Derive SLA status from a candidate object.
 * Returns null if there is no stage_entered_at or sla_deadline.
 *
 * The server annotates each candidate with `sla_deadline` (ISO string),
 * but we can also compute it client-side from stage_entered_at / sla_reset_at.
 */
export function slaInfo(candidate) {
  // Prefer the pre-computed sla_deadline from the server if present
  const deadlineIso = candidate.sla_deadline
    || (() => {
      const base = candidate.sla_reset_at && candidate.sla_reset_at > candidate.stage_entered_at
        ? candidate.sla_reset_at
        : candidate.stage_entered_at;
      if (!base) return null;
      return addBizDays(new Date(base.replace(' ', 'T')), 5).toISOString();
    })();

  if (!deadlineIso) return null;

  const deadline = new Date(deadlineIso);
  const now      = new Date();
  const msLeft   = deadline - now;

  // Business days remaining (approximate — for display only)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dlDay = new Date(deadline);
  dlDay.setHours(0, 0, 0, 0);

  let bizDaysLeft = 0;
  let cur = new Date(today);
  const breached = deadline < now;

  if (!breached) {
    while (cur < dlDay) {
      cur.setDate(cur.getDate() + 1);
      if (cur.getDay() !== 0 && cur.getDay() !== 6) bizDaysLeft++;
    }
  } else {
    while (cur > dlDay) {
      cur.setDate(cur.getDate() - 1);
      if (cur.getDay() !== 0 && cur.getDay() !== 6) bizDaysLeft--;
    }
  }

  const isEoW = deadline.getDay() === 5; // Friday

  return { deadline, bizDaysLeft, breached, isEoW };
}

function pad(n) { return String(n).padStart(2, '0'); }
