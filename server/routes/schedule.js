const express     = require('express');
const router      = express.Router();
const crypto      = require('crypto');
const db          = require('../db');
const requireAuth = require('../middleware/requireAuth');
const { getFreeBusy, generateSlots, createEvent } = require('../utils/gcal');

function token() {
  return crypto.randomBytes(16).toString('hex');
}

// ── POST /api/schedule ────────────────────────────────────────────
// Create a new schedule link (requireAuth)
router.post('/', requireAuth, async (req, res) => {
  const {
    candidate_id, mode = 'self-schedule',
    panelist_emails = [], duration_mins = 60,
    window_start, window_end,
    proposed_start, interview_title,
  } = req.body;

  if (!candidate_id) return res.status(400).json({ error: 'candidate_id required' });

  const candidate = db.prepare('SELECT * FROM candidates WHERE id = ?').get(candidate_id);
  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

  const tk = token();

  if (mode === 'propose') {
    if (!proposed_start) return res.status(400).json({ error: 'proposed_start required for propose mode' });

    const startMs   = new Date(proposed_start).getTime();
    const endMs     = startMs + duration_mins * 60 * 1000;
    const proposedEnd = new Date(endMs).toISOString();

    let eventId  = null;
    let meetLink = null;
    let eventStart = proposed_start;
    let eventEnd   = proposedEnd;

    // Build attendee list: panelists + candidate (if email available)
    const attendees = [...panelist_emails];
    if (candidate.email) attendees.push(candidate.email);

    try {
      const result = await createEvent({
        summary:        interview_title || `Interview: ${candidate.name}`,
        description:    `Interview for ${candidate.name}`,
        startTime:      proposed_start,
        endTime:        proposedEnd,
        attendeeEmails: attendees,
      });
      eventId   = result.eventId;
      meetLink  = result.meetLink;
    } catch (err) {
      console.error('[schedule] createEvent failed:', err.message);
      // Still create the row even if Calendar fails
    }

    db.prepare(`
      INSERT INTO schedule_links
        (token, candidate_id, created_by, mode, status, panelist_emails,
         duration_mins, proposed_start, proposed_end, interview_title,
         event_id, event_start, event_end, meet_link)
      VALUES (?, ?, ?, 'propose', 'booked', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      tk, candidate_id, req.user.id,
      JSON.stringify(panelist_emails), duration_mins,
      proposed_start, proposedEnd, interview_title || null,
      eventId, eventStart, eventEnd, meetLink
    );

    const row = db.prepare('SELECT * FROM schedule_links WHERE token = ?').get(tk);
    return res.json(row);
  }

  // mode === 'self-schedule'
  if (!window_start || !window_end) {
    return res.status(400).json({ error: 'window_start and window_end required for self-schedule mode' });
  }

  db.prepare(`
    INSERT INTO schedule_links
      (token, candidate_id, created_by, mode, status, panelist_emails,
       duration_mins, window_start, window_end, interview_title)
    VALUES (?, ?, ?, 'self-schedule', 'pending', ?, ?, ?, ?, ?)
  `).run(
    tk, candidate_id, req.user.id,
    JSON.stringify(panelist_emails), duration_mins,
    window_start, window_end, interview_title || null
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
  const panelistEmails = JSON.parse(link.panelist_emails || '[]');
  let slots = [];

  try {
    const busyByCalendar = panelistEmails.length > 0
      ? await getFreeBusy(panelistEmails, link.window_start, link.window_end)
      : {};
    slots = generateSlots(link.window_start, link.window_end, link.duration_mins, busyByCalendar);
  } catch (err) {
    console.error('[schedule] getFreeBusy failed — degrading gracefully:', err.message);
    // Generate slots without busy filtering
    slots = generateSlots(link.window_start, link.window_end, link.duration_mins, {});
  }

  res.json({ ...base, slots });
});

// ── POST /api/schedule/:token/book ────────────────────────────────
// Public: candidate books a slot
router.post('/:token/book', async (req, res) => {
  const link = db.prepare('SELECT * FROM schedule_links WHERE token = ?').get(req.params.token);
  if (!link)                    return res.status(404).json({ error: 'Link not found' });
  if (link.status === 'booked') return res.status(409).json({ error: 'This time slot has already been booked' });
  if (link.mode !== 'self-schedule') return res.status(400).json({ error: 'Cannot book a proposed-time link' });

  const { slot_start, candidate_name, candidate_email } = req.body;
  if (!slot_start) return res.status(400).json({ error: 'slot_start required' });

  // Validate slot is within the window
  const slotMs   = new Date(slot_start).getTime();
  const windowS  = new Date(link.window_start).getTime();
  const windowE  = new Date(link.window_end).getTime();
  const slotEnd  = slotMs + link.duration_mins * 60 * 1000;

  if (slotMs < windowS || slotEnd > windowE) {
    return res.status(400).json({ error: 'Slot is outside the scheduling window' });
  }

  // Gather attendees: panelists + candidate email
  const panelistEmails = JSON.parse(link.panelist_emails || '[]');
  const attendees = [...panelistEmails];
  if (candidate_email) attendees.push(candidate_email);

  // Get candidate info for the event
  const candidate = db.prepare('SELECT * FROM candidates WHERE id = ?').get(link.candidate_id);
  const candName  = candidate_name || candidate?.name || 'Candidate';

  let eventId  = null;
  let meetLink = null;

  try {
    const result = await createEvent({
      summary:        link.interview_title || `Interview: ${candName}`,
      description:    `Interview for ${candName}`,
      startTime:      slot_start,
      endTime:        new Date(slotEnd).toISOString(),
      attendeeEmails: attendees,
    });
    eventId  = result.eventId;
    meetLink = result.meetLink;
  } catch (err) {
    console.error('[schedule] createEvent failed on book:', err.message);
  }

  db.prepare(`
    UPDATE schedule_links
    SET status = 'booked', event_id = ?, event_start = ?, event_end = ?,
        meet_link = ?, booked_by_name = ?, booked_by_email = ?, booked_at = datetime('now')
    WHERE token = ?
  `).run(
    eventId, slot_start, new Date(slotEnd).toISOString(),
    meetLink, candName, candidate_email || null, req.params.token
  );

  res.json({
    ok:          true,
    meet_link:   meetLink,
    event_start: slot_start,
    event_end:   new Date(slotEnd).toISOString(),
  });
});

module.exports = router;
