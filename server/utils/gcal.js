const { google } = require('googleapis');
const db = require('../db');

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

function getOAuthClient() {
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/google-auth/callback';
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );
}

/**
 * Returns an authenticated OAuth2 client, refreshing the access token if needed.
 * Throws if Google Calendar is not connected.
 */
async function getAuthClient() {
  const refreshToken = getSetting('google_refresh_token');
  if (!refreshToken) throw new Error('Google Calendar not connected');

  const oauth2 = getOAuthClient();
  oauth2.setCredentials({
    refresh_token: refreshToken,
    access_token:  getSetting('google_access_token'),
    expiry_date:   Number(getSetting('google_token_expiry')) || 0,
  });

  // Proactively refresh if token is missing or expires within 60 seconds
  const expiry = Number(getSetting('google_token_expiry')) || 0;
  if (!getSetting('google_access_token') || Date.now() >= expiry - 60_000) {
    const { credentials } = await oauth2.refreshAccessToken();
    setSetting('google_access_token', credentials.access_token);
    setSetting('google_token_expiry', String(credentials.expiry_date));
    oauth2.setCredentials(credentials);
  }

  return oauth2;
}

/**
 * Queries FreeBusy for a list of panelist emails over a time window.
 * Returns { 'email@x.com': [{start, end}, ...], ... }
 */
async function getFreeBusy(panelistEmails, timeMin, timeMax) {
  const auth = await getAuthClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const { data } = await calendar.freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      items: panelistEmails.map(email => ({ id: email })),
    },
  });

  const result = {};
  for (const email of panelistEmails) {
    result[email] = (data.calendars?.[email]?.busy || []).map(b => ({
      start: b.start,
      end:   b.end,
    }));
  }
  return result;
}

/**
 * Walks timeMin→timeMax in 30-min steps and returns ISO start strings for
 * slots that are:
 *  - On weekdays (Mon–Fri)
 *  - Between 09:00 and 17:00 local time (we treat times as UTC for simplicity)
 *  - Not overlapping any panelist's busy intervals
 */
function generateSlots(timeMin, timeMax, durationMins, busyByCalendar) {
  const allBusy = Object.values(busyByCalendar).flat().map(b => ({
    start: new Date(b.start).getTime(),
    end:   new Date(b.end).getTime(),
  }));

  const slots = [];
  const step  = 30 * 60 * 1000; // 30 minutes
  const dur   = durationMins * 60 * 1000;
  let cur     = new Date(timeMin).getTime();
  const end   = new Date(timeMax).getTime();

  while (cur + dur <= end) {
    const d   = new Date(cur);
    const dow = d.getUTCDay(); // 0=Sun, 6=Sat
    const h   = d.getUTCHours();

    if (dow >= 1 && dow <= 5 && h >= 9 && h + durationMins / 60 <= 17) {
      const slotEnd = cur + dur;
      const busy = allBusy.some(b => cur < b.end && slotEnd > b.start);
      if (!busy) slots.push(d.toISOString());
    }
    cur += step;
  }
  return slots;
}

/**
 * Creates a Google Calendar event with a Meet link.
 * Returns { eventId, meetLink }
 */
async function createEvent({ summary, description, startTime, endTime, attendeeEmails }) {
  const auth = await getAuthClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const { data: event } = await calendar.events.insert({
    calendarId:            'primary',
    conferenceDataVersion: 1,
    sendUpdates:           'all',
    requestBody: {
      summary,
      description,
      start: { dateTime: startTime, timeZone: 'UTC' },
      end:   { dateTime: endTime,   timeZone: 'UTC' },
      attendees: attendeeEmails.map(email => ({ email })),
      conferenceData: {
        createRequest: { requestId: `gb-${Date.now()}`, conferenceSolutionKey: { type: 'hangoutsMeet' } },
      },
    },
  });

  const meetLink = event.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri || null;
  return { eventId: event.id, meetLink };
}

module.exports = { getAuthClient, getFreeBusy, generateSlots, createEvent };
