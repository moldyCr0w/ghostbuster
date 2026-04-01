const express     = require('express');
const router      = express.Router();
const requireAuth = require('../middleware/requireAuth');

// GET /api/settings — placeholder; individual HM accounts replaced the shared PIN
router.get('/', requireAuth, (_req, res) => {
  res.json({});
});

module.exports = router;
