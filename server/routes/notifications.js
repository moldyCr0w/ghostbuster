const express      = require('express');
const router       = express.Router();
const db           = require('../db');
const requireAuth  = require('../middleware/requireAuth');

// All notification routes require an authenticated recruiter session
router.use(requireAuth);

// GET /api/notifications — newest 50, scoped to current user (+ legacy unscoped rows)
router.get('/', (req, res) => {
  const rows = db.prepare(
    `SELECT * FROM notifications
     WHERE target_user_id = ? OR target_user_id IS NULL
     ORDER BY created_at DESC LIMIT 50`
  ).all(req.user.id);
  res.json(rows);
});

// GET /api/notifications/unread-count
router.get('/unread-count', (req, res) => {
  const { count } = db.prepare(
    `SELECT COUNT(*) as count FROM notifications
     WHERE is_read = 0 AND (target_user_id = ? OR target_user_id IS NULL)`
  ).get(req.user.id);
  res.json({ count });
});

// PATCH /api/notifications/read-all — mark every unread notification as read
// Must be declared BEFORE /:id/read so Express doesn't treat "read-all" as an :id
router.patch('/read-all', (req, res) => {
  db.prepare(
    `UPDATE notifications SET is_read = 1
     WHERE is_read = 0 AND (target_user_id = ? OR target_user_id IS NULL)`
  ).run(req.user.id);
  res.json({ success: true });
});

// PATCH /api/notifications/:id/read — mark a single notification as read
router.patch('/:id/read', (req, res) => {
  db.prepare("UPDATE notifications SET is_read = 1 WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
