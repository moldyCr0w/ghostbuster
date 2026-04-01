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

module.exports = router;
