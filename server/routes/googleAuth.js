const express     = require('express');
const router      = express.Router();
const { google }  = require('googleapis');
const path        = require('path');
const fs          = require('fs');
const db          = require('../db');
const requireAuth = require('../middleware/requireAuth');

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy',
  'email',
  'profile',
];

function getOAuthClient() {
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/google-auth/callback';
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );
}

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

function deleteSetting(key) {
  db.prepare('DELETE FROM settings WHERE key = ?').run(key);
}

// Determine where to redirect the browser after OAuth completes.
// In production the React app is served by Express itself (no separate dev server),
// so a relative path works. In dev the React dev server runs on :5173.
function clientBase() {
  const DIST = path.join(__dirname, '..', '..', 'client', 'dist');
  if (fs.existsSync(DIST)) return ''; // production: same origin
  return process.env.CLIENT_URL || 'http://localhost:5173';
}

// ── GET /api/google-auth/url ─────────────────────────────────────
// Returns the Google consent URL for the recruiter to visit.
router.get('/url', requireAuth, (_req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(503).json({
      error: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured.',
    });
  }
  const oauth2 = getOAuthClient();
  const url = oauth2.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // always re-consent so we always receive a refresh_token
  });
  res.json({ url });
});

// ── GET /api/google-auth/callback ───────────────────────────────
// Google redirects here with ?code=... after the user grants access.
router.get('/callback', async (req, res) => {
  const { code, error } = req.query;
  const base = clientBase();

  if (error || !code) {
    return res.redirect(`${base}/settings?gcal=error`);
  }

  try {
    const oauth2 = getOAuthClient();
    const { tokens } = await oauth2.getToken(code);

    // Fetch the connected account's email for display in Settings.
    oauth2.setCredentials(tokens);
    const oauth2Api = google.oauth2({ version: 'v2', auth: oauth2 });
    const { data: profile } = await oauth2Api.userinfo.get();

    setSetting('google_refresh_token',    tokens.refresh_token);
    setSetting('google_access_token',     tokens.access_token);
    setSetting('google_token_expiry',     String(tokens.expiry_date));
    setSetting('google_connected_email',  profile.email);

    res.redirect(`${base}/settings?gcal=connected`);
  } catch (err) {
    console.error('Google OAuth callback error:', err);
    res.redirect(`${clientBase()}/settings?gcal=error`);
  }
});

// ── GET /api/google-auth/status ──────────────────────────────────
// Returns whether a Google account is connected and which email.
router.get('/status', requireAuth, (_req, res) => {
  const email    = getSetting('google_connected_email');
  const hasToken = !!getSetting('google_refresh_token');
  res.json({ connected: hasToken && !!email, email: email || null });
});

// ── DELETE /api/google-auth/disconnect ──────────────────────────
// Revokes the token and clears stored credentials.
router.delete('/disconnect', requireAuth, async (_req, res) => {
  const token = getSetting('google_refresh_token');
  if (token) {
    try {
      const oauth2 = getOAuthClient();
      await oauth2.revokeToken(token);
    } catch (_) {
      // Revocation can fail if the token is already expired — still clean up locally.
    }
  }
  deleteSetting('google_refresh_token');
  deleteSetting('google_access_token');
  deleteSetting('google_token_expiry');
  deleteSetting('google_connected_email');
  res.json({ ok: true });
});

module.exports = router;
