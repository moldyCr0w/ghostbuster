const express = require('express');
const router  = express.Router();
const db      = require('../db');

// GET /api/users
router.get('/', (_req, res) => {
  res.json(db.prepare(
    'SELECT id, name, email, role, created_at FROM users ORDER BY name'
  ).all());
});

// POST /api/users
router.post('/', (req, res) => {
  const { name, email, role } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'name and email are required' });
  try {
    const r = db.prepare(
      'INSERT INTO users (name, email, role) VALUES (?, ?, ?)'
    ).run(name.trim(), email.toLowerCase().trim(), role || 'recruiter');
    res.status(201).json({ id: r.lastInsertRowid });
  } catch (err) {
    if (err.message.includes('UNIQUE'))
      return res.status(400).json({ error: 'A user with that email already exists' });
    throw err;
  }
});

// DELETE /api/users/:id
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
