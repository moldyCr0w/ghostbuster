const express      = require('express');
const router       = express.Router();
const db           = require('../db');
const requireAuth  = require('../middleware/requireAuth');

// GET /api/settings — returns non-sensitive settings (requires recruiter auth)
router.get('/', requireAuth, (_req, res) => {
  const hmPinRow = db.prepare("SELECT value FROM settings WHERE key='hm_pin'").get();
  res.json({ hm_pin_set: !!hmPinRow?.value });
});

// PUT /api/settings/hm-pin — set or update HM portal PIN (requires recruiter auth)
router.put('/hm-pin', requireAuth, (req, res) => {
  const { pin } = req.body || {};
  if (!pin || pin.trim().length < 4) {
    return res.status(400).json({ error: 'PIN must be at least 4 characters' });
  }
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('hm_pin', ?)").run(pin.trim());
  res.json({ success: true });
});

// DELETE /api/settings/hm-pin — remove HM PIN (disables HM auth)
router.delete('/hm-pin', requireAuth, (_req, res) => {
  db.prepare("DELETE FROM settings WHERE key='hm_pin'").run();
  res.json({ success: true });
});

module.exports = router;
