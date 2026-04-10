const express     = require('express');
const router      = express.Router();
const db          = require('../db');
const requireAuth = require('../middleware/requireAuth');
const { getFreeBusy } = require('../utils/gcal');

/**
 * POST /api/scheduling-tool/check-availability
 *
 * Body:
 *   {
 *     windows:    [{ start: ISO, end: ISO }, ...],   // candidate availability windows
 *     level?:     'senior' | 'staff_plus',            // panelist level filter
 *     tag_ids?:   number[],                           // panelist tech/skill filter
 *     duration_mins: number                           // interview duration
 *   }
 *
 * Response:
 *   {
 *     panelists: [
 *       {
 *         id, name, email, title, qualifications, interview_levels,
 *         windows: [{ windowIndex, free, conflictCount }, ...]
 *       }
 *     ]
 *   }
 */
router.post('/check-availability', requireAuth, async (req, res) => {
  const { windows = [], level, tag_ids = [], duration_mins = 60 } = req.body;

  if (!windows.length) {
    return res.status(400).json({ error: 'At least one availability window is required' });
  }

  // Validate all windows have valid dates
  for (const w of windows) {
    if (!w.start || !w.end || new Date(w.start) >= new Date(w.end)) {
      return res.status(400).json({ error: 'Each window must have a valid start and end time' });
    }
  }

  // Load and filter panelists
  let panelists = db.prepare('SELECT * FROM panelists ORDER BY name').all();

  if (level) {
    panelists = panelists.filter(p => {
      const levels = JSON.parse(p.interview_levels || '[]');
      return levels.includes(level);
    });
  }

  if (tag_ids.length) {
    panelists = panelists.filter(p => {
      const quals = JSON.parse(p.qualifications || '[]');
      return tag_ids.every(id => quals.includes(Number(id)));
    });
  }

  if (!panelists.length) {
    return res.json({ panelists: [] });
  }

  // Build the broadest time range to cover all windows in one FreeBusy call
  const timeMin = windows.reduce((min, w) => w.start < min ? w.start : min, windows[0].start);
  const timeMax = windows.reduce((max, w) => w.end   > max ? w.end   : max, windows[0].end);

  const panelistEmails = panelists.map(p => p.email);

  let busyByEmail = {};
  try {
    busyByEmail = await getFreeBusy(panelistEmails, timeMin, timeMax);
  } catch (err) {
    // If Google Calendar is not connected, return panelists without availability data
    if (err.message === 'Google Calendar not connected') {
      return res.json({
        panelists: panelists.map(p => enrichPanelist(p, windows.map((_, i) => ({ windowIndex: i, free: null, conflictCount: 0 })))),
        calendarNotConnected: true,
      });
    }
    throw err;
  }

  const durMs = duration_mins * 60 * 1000;

  // For each panelist, determine availability per window
  const result = panelists.map(p => {
    const busy = (busyByEmail[p.email] || []).map(b => ({
      start: new Date(b.start).getTime(),
      end:   new Date(b.end).getTime(),
    }));

    const windowResults = windows.map((w, i) => {
      const wStart = new Date(w.start).getTime();
      const wEnd   = new Date(w.end).getTime();

      // Count conflicts that overlap this window
      const conflicts = busy.filter(b => b.start < wEnd && b.end > wStart);

      // Check if there's a contiguous free block of `duration_mins` within the window
      let free = false;
      if (wEnd - wStart >= durMs) {
        // Walk the window in 15-min steps looking for a free slot of the required duration
        const step = 15 * 60 * 1000;
        let cursor = wStart;
        while (cursor + durMs <= wEnd) {
          const slotEnd = cursor + durMs;
          const blocked = busy.some(b => b.start < slotEnd && b.end > cursor);
          if (!blocked) { free = true; break; }
          cursor += step;
        }
      }

      return { windowIndex: i, free, conflictCount: conflicts.length };
    });

    return enrichPanelist(p, windowResults);
  });

  res.json({ panelists: result });
});

// Expand tag IDs → full tag objects and attach window availability
function enrichPanelist(panelist, windowResults) {
  const tagIds  = JSON.parse(panelist.qualifications   || '[]');
  const levels  = JSON.parse(panelist.interview_levels || '[]');
  const allTags = db.prepare('SELECT * FROM panelist_tags').all();
  const tagMap  = Object.fromEntries(allTags.map(t => [t.id, t]));

  return {
    id:               panelist.id,
    name:             panelist.name,
    email:            panelist.email,
    title:            panelist.title,
    qualifications:   tagIds.map(id => tagMap[id]).filter(Boolean),
    interview_levels: levels,
    windows:          windowResults,
  };
}

module.exports = router;
