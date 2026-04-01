const jwt    = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'ghostbuster-dev-secret';

/**
 * Accepts either a recruiter session (gb_token) or an HM session (gb_hm_token).
 * Used to protect routes that both recruiters and hiring managers need to access.
 */
module.exports = function requireHmAuth(req, res, next) {
  // Recruiter cookie takes priority
  const recruiterToken = req.cookies?.gb_token;
  if (recruiterToken) {
    try {
      req.user = jwt.verify(recruiterToken, SECRET);
      return next();
    } catch (_) {}
  }

  // HM session cookie
  const hmToken = req.cookies?.gb_hm_token;
  if (hmToken) {
    try {
      const payload = jwt.verify(hmToken, SECRET);
      if (payload.role === 'hm') {
        req.user = payload;
        return next();
      }
    } catch (_) {}
  }

  return res.status(401).json({ error: 'Authentication required' });
};
