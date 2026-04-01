const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const db      = require('../db');

const SECRET      = process.env.JWT_SECRET || 'ghostbuster-dev-secret';
const COOKIE_OPTS = { httpOnly: true, sameSite: 'strict', maxAge: 24 * 60 * 60 * 1000 };

// ── Helper: does the app have any users yet? ──────────────────
function hasUsers() {
  return db.prepare('SELECT COUNT(*) as c FROM users').get().c > 0;
}

// GET /api/auth/status — tells the client whether auth is required
router.get('/status', (_req, res) => {
  res.json({ requiresAuth: hasUsers() });
});

// GET /api/auth/me — returns the logged-in user (or null)
router.get('/me', (req, res) => {
  const token = req.cookies?.gb_token;
  if (!token) return res.json({ user: null, requiresAuth: hasUsers() });
  try {
    const payload = jwt.verify(token, SECRET);
    const user    = db.prepare('SELECT id, name, email, role FROM users WHERE id=?').get(payload.id);
    res.json({ user: user || null, requiresAuth: hasUsers() });
  } catch {
    res.json({ user: null, requiresAuth: hasUsers() });
  }
});

// POST /api/auth/request — generate a 6-digit magic PIN for the given email
router.post('/request', (req, res) => {
  const email = (req.body.email || '').toLowerCase().trim();
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const user = db.prepare('SELECT id FROM users WHERE email=?').get(email);
  if (!user) return res.status(404).json({ error: 'No account found for that email address' });

  // Invalidate any previous unused tokens for this email
  db.prepare('UPDATE magic_tokens SET used=1 WHERE email=?').run(email);

  const pin       = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min
  db.prepare('INSERT INTO magic_tokens (email, pin, expires_at) VALUES (?, ?, ?)').run(email, pin, expiresAt);

  // In production, send this PIN by email.
  // For now it is returned directly so admins can share it over Slack / verbally.
  res.json({ pin, note: 'Share this PIN securely — it expires in 10 minutes' });
});

// POST /api/auth/verify — validate PIN and issue a session cookie
router.post('/verify', (req, res) => {
  const email = (req.body.email || '').toLowerCase().trim();
  const pin   = (req.body.pin   || '').trim();
  if (!email || !pin) return res.status(400).json({ error: 'Email and PIN are required' });

  const now   = new Date().toISOString();
  const token = db.prepare(
    'SELECT * FROM magic_tokens WHERE email=? AND pin=? AND used=0 AND expires_at > ?'
  ).get(email, pin, now);

  if (!token) return res.status(401).json({ error: 'Invalid or expired PIN' });

  // Single-use: mark it consumed
  db.prepare('UPDATE magic_tokens SET used=1 WHERE id=?').run(token.id);

  const user = db.prepare('SELECT id, name, email, role FROM users WHERE email=?').get(email);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const jwtToken = jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    SECRET,
    { expiresIn: '24h' }
  );
  res.cookie('gb_token', jwtToken, COOKIE_OPTS);
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

// POST /api/auth/logout
router.post('/logout', (_req, res) => {
  res.clearCookie('gb_token', { httpOnly: true, sameSite: 'strict' });
  res.json({ success: true });
});

/* ── HM portal auth (individual accounts + OTP) ─────────────── */

const HM_COOKIE_OPTS = { httpOnly: true, sameSite: 'strict', maxAge: 30 * 24 * 60 * 60 * 1000 };

// GET /api/auth/hm-me — check HM session, return name/email for header display
router.get('/hm-me', (req, res) => {
  const token = req.cookies?.gb_hm_token;
  if (!token) return res.json({ authenticated: false });
  try {
    const payload = jwt.verify(token, SECRET);
    if (payload.role !== 'hm') return res.json({ authenticated: false });
    res.json({ authenticated: true, name: payload.name, email: payload.email });
  } catch {
    res.json({ authenticated: false });
  }
});

// POST /api/auth/hm-request — generate a one-time PIN for a registered HM
router.post('/hm-request', (req, res) => {
  const email = (req.body.email || '').toLowerCase().trim();
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const user = db.prepare('SELECT id, name FROM hm_users WHERE email=?').get(email);
  if (!user) return res.status(404).json({ error: 'No HM account found for that email. Ask your recruiter to add you in Settings.' });

  // Invalidate any previous unused tokens for this email
  db.prepare('UPDATE hm_magic_tokens SET used=1 WHERE email=?').run(email);

  const pin       = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO hm_magic_tokens (email, pin, expires_at) VALUES (?, ?, ?)').run(email, pin, expiresAt);

  res.json({ pin, note: 'Share this PIN securely — it expires in 10 minutes' });
});

// POST /api/auth/hm-login — validate OTP + email, issue 30-day session cookie
router.post('/hm-login', (req, res) => {
  const email = (req.body.email || '').toLowerCase().trim();
  const pin   = (req.body.pin   || '').trim();
  if (!email || !pin) return res.status(400).json({ error: 'Email and PIN are required' });

  const now   = new Date().toISOString();
  const token = db.prepare(
    'SELECT * FROM hm_magic_tokens WHERE email=? AND pin=? AND used=0 AND expires_at > ?'
  ).get(email, pin, now);
  if (!token) return res.status(401).json({ error: 'Invalid or expired PIN' });

  db.prepare('UPDATE hm_magic_tokens SET used=1 WHERE id=?').run(token.id);

  const user = db.prepare('SELECT id, name, email FROM hm_users WHERE email=?').get(email);
  if (!user) return res.status(404).json({ error: 'HM user not found' });

  const jwtToken = jwt.sign(
    { role: 'hm', id: user.id, name: user.name, email: user.email },
    SECRET,
    { expiresIn: '30d' }
  );
  res.cookie('gb_hm_token', jwtToken, HM_COOKIE_OPTS);
  res.json({ success: true });
});

// POST /api/auth/hm-logout
router.post('/hm-logout', (_req, res) => {
  res.clearCookie('gb_hm_token', { httpOnly: true, sameSite: 'strict' });
  res.json({ success: true });
});

module.exports = router;
