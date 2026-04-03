const express     = require('express');
const router      = express.Router();
const db          = require('../db');
const requireAuth = require('../middleware/requireAuth');

// All routes require recruiter/admin auth

// GET /api/hm-users — list all registered HMs
router.get('/', requireAuth, (_req, res) => {
  res.json(db.prepare(
    'SELECT id, name, email, created_at FROM hm_users ORDER BY name'
  ).all());
});

// POST /api/hm-users — add a new HM
router.post('/', requireAuth, (req, res) => {
  const { name, email } = req.body || {};
  if (!name || !email) return res.status(400).json({ error: 'name and email are required' });
  try {
    const r = db.prepare(
      'INSERT INTO hm_users (name, email) VALUES (?, ?)'
    ).run(name.trim(), email.toLowerCase().trim());
    res.status(201).json({ id: r.lastInsertRowid });
  } catch (err) {
    if (err.message.includes('UNIQUE'))
      return res.status(400).json({ error: 'An HM with that email already exists' });
    throw err;
  }
});

// PUT /api/hm-users/:id — update an HM's name and/or email
router.put('/:id', requireAuth, (req, res) => {
  const { name, email } = req.body || {};
  if (!name || !email) return res.status(400).json({ error: 'name and email are required' });
  try {
    db.prepare(
      'UPDATE hm_users SET name=?, email=? WHERE id=?'
    ).run(name.trim(), email.toLowerCase().trim(), req.params.id);
    res.json({ success: true });
  } catch (err) {
    if (err.message.includes('UNIQUE'))
      return res.status(400).json({ error: 'An HM with that email already exists' });
    throw err;
  }
});

// DELETE /api/hm-users/:id — remove an HM
router.delete('/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM hm_users WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
