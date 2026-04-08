const express     = require('express');
const router      = express.Router();
const db          = require('../db');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');

// All user-management routes require a logged-in session
router.use(requireAuth);

// GET /api/users  — any authenticated user can see the team roster
router.get('/', (_req, res) => {
  res.json(db.prepare(
    'SELECT id, name, email, role, created_at FROM users ORDER BY name'
  ).all());
});

// POST /api/users  — admin only
router.post('/', requireRole('admin'), (req, res) => {
  const { name, email, role } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'name and email are required' });
  const VALID = ['recruiter', 'senior_recruiter', 'admin'];
  const assignedRole = VALID.includes(role) ? role : 'recruiter';
  try {
    const r = db.prepare(
      'INSERT INTO users (name, email, role) VALUES (?, ?, ?)'
    ).run(name.trim(), email.toLowerCase().trim(), assignedRole);
    res.status(201).json({ id: r.lastInsertRowid });
  } catch (err) {
    if (err.message.includes('UNIQUE'))
      return res.status(400).json({ error: 'A user with that email already exists' });
    throw err;
  }
});

// PATCH /api/users/:id/role  — admin only; cannot change your own role
router.patch('/:id/role', requireRole('admin'), (req, res) => {
  const { role } = req.body;
  const VALID = ['recruiter', 'senior_recruiter', 'admin'];
  if (!VALID.includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (Number(req.params.id) === req.user.id) {
    return res.status(400).json({ error: 'You cannot change your own role' });
  }
  const result = db.prepare('UPDATE users SET role=? WHERE id=?').run(role, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'User not found' });
  res.json({ success: true });
});

// DELETE /api/users/:id  — admin only
router.delete('/:id', requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
