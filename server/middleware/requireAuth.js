const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'ghostbuster-dev-secret';

module.exports = function requireAuth(req, res, next) {
  const token = req.cookies?.gb_token;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Session expired — please log in again' });
  }
};
