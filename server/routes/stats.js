const express     = require('express');
const router      = express.Router();
const db          = require('../db');
const requireAuth = require('../middleware/requireAuth');

// GET /api/stats — all pipeline metrics in one call
router.get('/', requireAuth, (_req, res) => {

  // ── Average Time to Fill (days from created_at → hired) ──────
  const ttfRow = db.prepare(`
    SELECT AVG(julianday(c.stage_entered_at) - julianday(c.created_at)) AS avg_ttf
    FROM   candidates c
    JOIN   stages s ON c.stage_id = s.id
    WHERE  s.is_hire = 1 AND c.hired_for_req_id IS NOT NULL
  `).get();
  const avgTtf = ttfRow?.avg_ttf != null ? Math.round(ttfRow.avg_ttf) : null;

  // ── Total hired (all time) ────────────────────────────────────
  const totalHired = db.prepare(`
    SELECT COUNT(*) AS n FROM candidates c
    JOIN stages s ON c.stage_id = s.id WHERE s.is_hire = 1
  `).get().n;

  // ── Open reqs ─────────────────────────────────────────────────
  const openReqs = db.prepare(
    "SELECT COUNT(*) AS n FROM reqs WHERE status = 'open'"
  ).get().n;

  // ── Stage funnel (non-terminal stages, active candidates) ─────
  const funnel = db.prepare(`
    SELECT s.name, s.order_index, s.color, s.is_terminal,
           COUNT(c.id) AS count
    FROM   stages s
    LEFT JOIN candidates c ON c.stage_id = s.id
    GROUP BY s.id
    ORDER BY s.order_index
  `).all();

  // ── HM decisions summary ──────────────────────────────────────
  const hmDecisions = db.prepare(`
    SELECT decision, COUNT(*) AS count
    FROM   notifications
    WHERE  type IN ('hm_forward', 'hm_decline')
    GROUP BY decision
  `).all();

  const hmForward = hmDecisions.find(r => r.decision === 'forward')?.count || 0;
  const hmDecline = hmDecisions.find(r => r.decision === 'decline')?.count || 0;
  const hmTotal   = hmForward + hmDecline;
  const hmForwardRate = hmTotal > 0 ? Math.round((hmForward / hmTotal) * 100) : null;
  const hmDeclineRate = hmTotal > 0 ? Math.round((hmDecline / hmTotal) * 100) : null;

  // ── HM declined candidates list ───────────────────────────────
  const declinedList = db.prepare(`
    SELECT n.id, n.candidate_name, n.req_title, n.created_at,
           c.role, c.company
    FROM   notifications n
    LEFT JOIN candidates c ON c.id = n.candidate_id
    WHERE  n.type = 'hm_decline'
    ORDER BY n.created_at DESC
    LIMIT 200
  `).all();

  res.json({
    avgTtf,
    totalHired,
    openReqs,
    funnel,
    hmForward,
    hmDecline,
    hmTotal,
    hmForwardRate,
    hmDeclineRate,
    declinedList,
  });
});

module.exports = router;
