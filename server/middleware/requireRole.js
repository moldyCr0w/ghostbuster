const ROLE_RANK = { recruiter: 1, senior_recruiter: 2, coordinator: 2, admin: 3 };

/**
 * Middleware factory that enforces a minimum role level.
 * Must be used AFTER requireAuth (which populates req.user).
 *
 * Usage:
 *   router.post('/', requireAuth, requireRole('senior_recruiter'), handler)
 */
module.exports = function requireRole(minRole) {
  return (req, res, next) => {
    const rank = ROLE_RANK[req.user?.role] ?? 0;
    if (rank < ROLE_RANK[minRole]) {
      return res.status(403).json({ error: 'Forbidden — insufficient permissions' });
    }
    next();
  };
};
