const express     = require('express');
const router      = express.Router();
const crypto      = require('crypto');
const db          = require('../db');
const requireAuth = require('../middleware/requireAuth');
const { getFreeBusy, generateSlots, createEvent } = require('../utils/gcal');

function token() {
  return crypto.randomBytes(16).toString('hex');
}

// ── Round-robin helpers ───────────────────────────────────────────

/**
 * Returns all panelists eligible for the given interview type.
 * Eligibility rules:
 *   - interview_levels must include level_requirement
 *   - staff_plus panelists are also eligible for 'senior' interviews
 *   - if required_tag_id is set, panelist must have that tag in qualifications
 */
function getEligiblePanelists(it) {
  const all = db.prepare('SELECT * FROM panelists').all();
  return all.filter(p => {
    const levels = JSON.parse(p.interview_levels || '[]');
    const levelOk = levels.includes(it.level_requirement)
      || (it.level_requirement === 'senior' && levels.includes('staff_plus'));
    if (!levelOk) return false;
    if (it.required_tag_id) {
      const quals = JSON.parse(p.qualifications || '[]');
      // qualifications may be tag IDs (numbers) or tag objects {id, name}
      const tagIds = quals.map(q => (typeof q === 'object' ? q.id : q));
      return tagIds.includes(it.required_tag_id);
    }
    return true;
  });
}

/**
 * Counts how many times each panelist email has been assigned
 * across all booked schedule_links (for round-robin load balancing).
 * Returns { 'email@x.com': count, ... }
 */
function getRoundRobinCounts() {
  const rows = db.prepare(
    "SELECT panelist_emails FROM schedule_links WHERE status = 'booked'"
  ).all();
  const counts = {};
  rows.forEach(r => {
    JSON.parse(r.panelist_emails || '[]').forEach(email => {
      counts[email] = (counts[email] || 0) + 1;
    });
  });
  return counts;
}

/**
 * Picks min_panelists panelists from freePanelists using round-robin
 * (least-assigned first), while respecting composition requirements:
 *   - For staff_plus interviews: at least 1 selected must be staff_plus
 */
function selectRoundRobinPanel(freePanelists, it, counts) {
  const byCount = p => counts[p.email] || 0;
  const isStaffPlus = p => JSON.parse(p.interview_levels || '[]').includes('staff_plus');

  if (it.level_requirement === 'staff_plus') {
    // Guarantee at least 1 staff_plus seat; fill the rest from the full pool
    const staffPlus = freePanelists.filter(isStaffPlus)
      .sort((a, b) => byCount(a) - byCount(b) || a.email.localeCompare(b.email));
    const others    = freePanelists.filter(p => !isStaffPlus(p))
      .sort((a, b) => byCount(a) - byCount(b) || a.email.localeCompare(b.email));

    if (staffPlus.length === 0) return []; // can't meet composition — caller handles error

    const selected = [staffPlus[0]];
    const remaining = [...staffPlus.slice(1), ...others]; // staff+ first for round-robin fairness
    for (const p of remaining) {
      if (selected.length >= it.min_panelists) break;
      selected.push(p);
    }
    return selected;
  }

  // Senior (or any) — just sort by count and take the first min_panelists
  return [...freePanelists]
    .sort((a, b) => byCount(a) - byCount(b) || a.email.localeCompare(b.email))
    .slice(0, it.min_panelists);
}

/**
 * Generates available slot start times for the candidate self-schedule page,
 * based on the POOL of eligible panelists rather than a fixed set.
 *
 * A slot is available when:
 *   - It falls on a weekday between 09:00–17:00 UTC
 *   - At least min_panelists eligible panelists are free
 *   - (For staff_plus interviews) at least 1 of those free panelists is staff_plus
 */
function generateRoundRobinSlots(timeMin, timeMax, durationMins, busyByCalendar, panelists, it) {
  // Pre-compute busy intervals per panelist
  const busyMap = {};
  for (const p of panelists) {
    busyMap[p.email] = (busyByCalendar[p.email] || []).map(b => ({
      start: new Date(b.start).getTime(),
      end:   new Date(b.end).getTime(),
    }));
  }

  const isStaffPlus = p => JSON.parse(p.interview_levels || '[]').includes('staff_plus');

  const slots  = [];
  const step   = 30 * 60 * 1000;
  const dur    = durationMins * 60 * 1000;
  let   cur    = new Date(timeMin).getTime();
  const end    = new Date(timeMax).getTime();

  while (cur + dur <= end) {
    const d   = new Date(cur);
    const dow = d.getUTCDay();
    const h   = d.getUTCHours();

    if (dow >= 1 && dow <= 5 && h >= 9 && h + durationMins / 60 <= 17) {
      const slotEnd = cur + dur;

      const free = panelists.filter(p =>
        !(busyMap[p.email] || []).some(b => cur < b.end && slotEnd > b.start)
      );

      if (free.length >= it.min_panelists) {
        const meetsComposition = it.level_requirement !== 'staff_plus'
          || free.some(isStaffPlus);
        if (meetsComposition) slots.push(d.toISOString());
      }
    }
    cur += step;
  }
  return slots;
}

// ── POST /api/schedule ────────────────────────────────────────────
// Create a new schedule link (requireAuth)
router.post('/', requireAuth, async (req, res) => {
  const {
    candidate_id, mode = 'self-schedule',
    panelist_emails = [], duration_mins = 60,
    window_start, window_end,
    proposed_start, interview_title,
    interview_type_id, req_id,
  } = req.body;

  if (!candidate_id) return res.status(400).json({ error: 'candidate_id required' });

  const candidate = db.prepare('SELECT * FROM candidates WHERE id = ?').get(candidate_id);
  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

  // Resolve whiteboard URL from interview type (if set)
  let whiteboard_url = null;
  if (interview_type_id) {
    const it = db.prepare('SELECT whiteboard_url FROM interview_types WHERE id = ?').get(Number(interview_type_id));
    whiteboard_url = it?.whiteboard_url || null;
  }

  const tk = token();

  if (mode === 'propose') {
    if (!proposed_start) return res.status(400).json({ error: 'proposed_start required for propose mode' });

    const startMs     = new Date(proposed_start).getTime();
    const endMs       = startMs + duration_mins * 60 * 1000;
    const proposedEnd = new Date(endMs).toISOString();

    let eventId    = null;
    let meetLink   = null;
    let eventStart = proposed_start;
    let eventEnd   = proposedEnd;

    const panelistDesc = whiteboard_url
      ? `Interview for ${candidate.name}\n\nWhiteboard: ${whiteboard_url}`
      : `Interview for ${candidate.name}`;
    const candidateDesc = whiteboard_url
      ? `Your interview with the team.\n\nWhiteboard: ${whiteboard_url}`
      : `Your interview with the team.`;

    try {
      // 1. Panelist event — generates the Google Meet link
      const result = await createEvent({
        summary:        interview_title || `Interview: ${candidate.name}`,
        description:    panelistDesc,
        startTime:      proposed_start,
        endTime:        proposedEnd,
        attendeeEmails: panelist_emails,
      });
      eventId  = result.eventId;
      meetLink = result.meetLink;

      // 2. Candidate event — separate invite reusing the same Meet link
      if (candidate.email) {
        await createEvent({
          summary:          interview_title || `Interview: ${candidate.name}`,
          description:      candidateDesc,
          startTime:        proposed_start,
          endTime:          proposedEnd,
          attendeeEmails:   [candidate.email],
          existingMeetLink: meetLink,
        });
      }
    } catch (err) {
      console.error('[schedule] createEvent failed:', err.message);
      // Still create the row even if Calendar fails
    }

    db.prepare(`
      INSERT INTO schedule_links
        (token, candidate_id, created_by, req_id, mode, status, panelist_emails,
         duration_mins, proposed_start, proposed_end, interview_title,
         event_id, event_start, event_end, meet_link, interview_type_id)
      VALUES (?, ?, ?, ?, 'propose', 'booked', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      tk, candidate_id, req.user.id,
      req_id ? Number(req_id) : null,
      JSON.stringify(panelist_emails), duration_mins,
      proposed_start, proposedEnd, interview_title || null,
      eventId, eventStart, eventEnd, meetLink,
      interview_type_id ? Number(interview_type_id) : null
    );

    const row = db.prepare('SELECT * FROM schedule_links WHERE token = ?').get(tk);
    return res.json(row);
  }

  // mode === 'self-schedule'
  if (!window_start || !window_end) {
    return res.status(400).json({ error: 'window_start and window_end required for self-schedule mode' });
  }

  // For round-robin mode (interview_type_id set), panelist_emails starts empty —
  // panelists are auto-assigned from the eligible pool at booking time.
  const storedEmails = interview_type_id ? [] : panelist_emails;

  db.prepare(`
    INSERT INTO schedule_links
      (token, candidate_id, created_by, req_id, mode, status, panelist_emails,
       duration_mins, window_start, window_end, interview_title, interview_type_id)
    VALUES (?, ?, ?, ?, 'self-schedule', 'pending', ?, ?, ?, ?, ?, ?)
  `).run(
    tk, candidate_id, req.user.id,
    req_id ? Number(req_id) : null,
    JSON.stringify(storedEmails), duration_mins,
    window_start, window_end, interview_title || null,
    interview_type_id ? Number(interview_type_id) : null
  );

  const row = db.prepare('SELECT * FROM schedule_links WHERE token = ?').get(tk);
  res.json(row);
});

// ── GET /api/schedule/candidate/:candidateId ─────────────────────
// List all schedule links for a candidate (requireAuth)
router.get('/candidate/:candidateId', requireAuth, (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM schedule_links WHERE candidate_id = ? ORDER BY created_at DESC'
  ).all(req.params.candidateId);
  res.json(rows);
});

// ── GET /api/schedule/:token ──────────────────────────────────────
// Public: return link info + available slots
router.get('/:token', async (req, res) => {
  const link = db.prepare('SELECT * FROM schedule_links WHERE token = ?').get(req.params.token);
  if (!link) return res.status(404).json({ error: 'Link not found' });

  const base = {
    token:           link.token,
    mode:            link.mode,
    status:          link.status,
    duration_mins:   link.duration_mins,
    interview_title: link.interview_title,
    meet_link:       link.meet_link,
    event_start:     link.event_start,
    event_end:       link.event_end,
  };

  if (link.status === 'booked' || link.mode === 'propose') {
    return res.json(base);
  }

  // Self-schedule: compute available slots
  let slots = [];

  try {
    if (link.interview_type_id) {
      // ── Round-robin mode: compute slots from the full eligible panelist pool ──
      const it   = db.prepare('SELECT * FROM interview_types WHERE id = ?').get(link.interview_type_id);
      const pool = it ? getEligiblePanelists(it) : [];

      if (pool.length < (it?.min_panelists ?? 1)) {
        // Not enough panelists in pool — return empty slots rather than crashing
        console.warn('[schedule] Not enough eligible panelists for round-robin, returning no slots');
      } else {
        const emails         = pool.map(p => p.email).filter(Boolean);
        const busyByCalendar = emails.length > 0
          ? await getFreeBusy(emails, link.window_start, link.window_end)
          : {};
        slots = generateRoundRobinSlots(
          link.window_start, link.window_end, link.duration_mins,
          busyByCalendar, pool, it
        );
      }
    } else {
      // ── Legacy mode: fixed panelist list ──
      const panelistEmails = JSON.parse(link.panelist_emails || '[]');
      const busyByCalendar = panelistEmails.length > 0
        ? await getFreeBusy(panelistEmails, link.window_start, link.window_end)
        : {};
      slots = generateSlots(link.window_start, link.window_end, link.duration_mins, busyByCalendar);
    }
  } catch (err) {
    console.error('[schedule] slot computation failed — degrading gracefully:', err.message);
    // Degrade: return slots with no busy filtering
    slots = generateSlots(link.window_start, link.window_end, link.duration_mins, {});
  }

  res.json({ ...base, slots });
});

// ── POST /api/schedule/:token/book ────────────────────────────────
// Public: candidate books a slot
router.post('/:token/book', async (req, res) => {
  const link = db.prepare('SELECT * FROM schedule_links WHERE token = ?').get(req.params.token);
  if (!link)                     return res.status(404).json({ error: 'Link not found' });
  if (link.status === 'booked')  return res.status(409).json({ error: 'This time slot has already been booked' });
  if (link.mode !== 'self-schedule') return res.status(400).json({ error: 'Cannot book a proposed-time link' });

  const { slot_start, candidate_name, candidate_email } = req.body;
  if (!slot_start) return res.status(400).json({ error: 'slot_start required' });

  // Validate slot is within the window
  const slotMs  = new Date(slot_start).getTime();
  const windowS = new Date(link.window_start).getTime();
  const windowE = new Date(link.window_end).getTime();
  const slotEnd = slotMs + link.duration_mins * 60 * 1000;

  if (slotMs < windowS || slotEnd > windowE) {
    return res.status(400).json({ error: 'Slot is outside the scheduling window' });
  }

  // Get candidate info
  const candidate = db.prepare('SELECT * FROM candidates WHERE id = ?').get(link.candidate_id);
  const candName  = candidate_name || candidate?.name || 'Candidate';
  const candEmail = candidate_email || candidate?.email || null;

  // Resolve panelists for this booking
  let assignedEmails = JSON.parse(link.panelist_emails || '[]'); // legacy fixed list

  if (link.interview_type_id) {
    // ── Round-robin assignment ──
    const it   = db.prepare('SELECT * FROM interview_types WHERE id = ?').get(link.interview_type_id);
    const pool = it ? getEligiblePanelists(it) : [];

    // Re-query FreeBusy just for this slot to confirm availability
    const poolEmails = pool.map(p => p.email).filter(Boolean);
    let busyAtSlot = {};
    try {
      if (poolEmails.length > 0) {
        busyAtSlot = await getFreeBusy(
          poolEmails,
          new Date(slotMs).toISOString(),
          new Date(slotEnd).toISOString()
        );
      }
    } catch (err) {
      console.error('[schedule] FreeBusy check at booking failed:', err.message);
    }

    const slotEndMs = slotEnd;
    const free = pool.filter(p => {
      return !(busyAtSlot[p.email] || []).some(b =>
        slotMs < new Date(b.end).getTime() && slotEndMs > new Date(b.start).getTime()
      );
    });

    if (it && free.length < it.min_panelists) {
      return res.status(409).json({
        error: 'This slot no longer has enough available panelists. Please choose another time.',
      });
    }

    const counts  = getRoundRobinCounts();
    const panel   = it ? selectRoundRobinPanel(free, it, counts) : free.slice(0, 2);

    if (it?.level_requirement === 'staff_plus' && panel.length === 0) {
      return res.status(409).json({
        error: 'No Staff+ panelists available for this slot. Please choose another time.',
      });
    }

    assignedEmails = panel.map(p => p.email);
  }

  // Resolve whiteboard URL from interview type for calendar descriptions
  let bookWhiteboardUrl = null;
  if (link.interview_type_id) {
    const it = db.prepare('SELECT whiteboard_url FROM interview_types WHERE id = ?').get(link.interview_type_id);
    bookWhiteboardUrl = it?.whiteboard_url || null;
  }

  const panelistDesc = bookWhiteboardUrl
    ? `Interview for ${candName}\n\nWhiteboard: ${bookWhiteboardUrl}`
    : `Interview for ${candName}`;
  const candidateDesc = bookWhiteboardUrl
    ? `Your interview with the team.\n\nWhiteboard: ${bookWhiteboardUrl}`
    : `Your interview with the team.`;

  let eventId  = null;
  let meetLink = null;

  try {
    // 1. Panelist event — generates the Google Meet link
    const result = await createEvent({
      summary:        link.interview_title || `Interview: ${candName}`,
      description:    panelistDesc,
      startTime:      slot_start,
      endTime:        new Date(slotEnd).toISOString(),
      attendeeEmails: assignedEmails,
    });
    eventId  = result.eventId;
    meetLink = result.meetLink;

    // 2. Candidate event — separate invite reusing the same Meet link
    if (candEmail) {
      await createEvent({
        summary:          link.interview_title || `Interview: ${candName}`,
        description:      candidateDesc,
        startTime:        slot_start,
        endTime:          new Date(slotEnd).toISOString(),
        attendeeEmails:   [candEmail],
        existingMeetLink: meetLink,
      });
    }
  } catch (err) {
    console.error('[schedule] createEvent failed on book:', err.message);
  }

  db.prepare(`
    UPDATE schedule_links
    SET status = 'booked', event_id = ?, event_start = ?, event_end = ?,
        meet_link = ?, booked_by_name = ?, booked_by_email = ?, booked_at = datetime('now'),
        panelist_emails = ?
    WHERE token = ?
  `).run(
    eventId, slot_start, new Date(slotEnd).toISOString(),
    meetLink, candName, candEmail,
    JSON.stringify(assignedEmails),
    req.params.token
  );

  res.json({
    ok:          true,
    meet_link:   meetLink,
    event_start: slot_start,
    event_end:   new Date(slotEnd).toISOString(),
  });
});

module.exports = router;
