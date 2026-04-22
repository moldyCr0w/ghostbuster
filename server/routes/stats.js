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
    SELECT s.name, s.order_index, s.color, s.is_terminal, s.is_withdraw,
           COUNT(c.id) AS count
    FROM   stages s
    LEFT JOIN candidates c ON c.stage_id = s.id
    GROUP BY s.id
    ORDER BY s.order_index
  `).all();

  // ── Candidate withdrew count (separate from company rejections) ─
  const withdrawnCount = db.prepare(`
    SELECT COUNT(*) AS n FROM candidates c
    JOIN stages s ON c.stage_id = s.id WHERE s.is_withdraw = 1
  `).get().n;

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
    withdrawnCount,
    hmForward,
    hmDecline,
    hmTotal,
    hmForwardRate,
    hmDeclineRate,
    declinedList,
  });
});

// GET /api/stats/by-req — per-requisition pipeline breakdown
router.get('/by-req', requireAuth, (_req, res) => {
  // Flat rows: for each req × stage, candidate count
  const rows = db.prepare(`
    SELECT r.id          AS req_id,
           r.req_id      AS req_ext_id,
           r.title,
           r.department,
           r.hiring_manager,
           r.status,
           r.priority,
           s.id          AS stage_id,
           s.name        AS stage_name,
           s.color,
           s.order_index,
           s.is_terminal,
           s.is_hire,
           s.is_hm_review,
           COUNT(c.id)   AS count
    FROM   reqs r
    LEFT JOIN candidate_reqs cr ON cr.req_id = r.id
    LEFT JOIN candidates c ON c.id = cr.candidate_id
    LEFT JOIN stages s ON c.stage_id = s.id
    GROUP BY r.id, s.id
    ORDER BY r.status DESC, r.title, s.order_index
  `).all();

  // HM decisions per req — joined by req_title text (only linkage available)
  const decisions = db.prepare(`
    SELECT r.id, n.decision, COUNT(n.id) AS count
    FROM   reqs r
    LEFT JOIN notifications n
      ON n.req_title = r.title
      AND n.type IN ('hm_forward', 'hm_decline')
    GROUP BY r.id, n.decision
  `).all();

  // Group rows into reqs
  const reqMap = new Map();
  for (const row of rows) {
    if (!reqMap.has(row.req_id)) {
      reqMap.set(row.req_id, {
        id:             row.req_id,
        req_ext_id:     row.req_ext_id,
        title:          row.title,
        department:     row.department,
        hiring_manager: row.hiring_manager,
        status:         row.status,
        priority:       row.priority,
        stages:         [],
        hmForward:      0,
        hmDecline:      0,
      });
    }
    if (row.stage_id != null) {
      reqMap.get(row.req_id).stages.push({
        stage_id:     row.stage_id,
        stage_name:   row.stage_name,
        color:        row.color,
        order_index:  row.order_index,
        is_terminal:  row.is_terminal,
        is_hire:      row.is_hire,
        is_hm_review: row.is_hm_review,
        count:        row.count,
      });
    }
  }

  // Merge HM decisions
  for (const dec of decisions) {
    const req = reqMap.get(dec.id);
    if (!req) continue;
    if (dec.decision === 'forward') req.hmForward += dec.count;
    if (dec.decision === 'decline') req.hmDecline += dec.count;
  }

  const result = Array.from(reqMap.values()).map(r => ({
    ...r,
    hmTotal:          r.hmForward + r.hmDecline,
    activeCandidates: r.stages.filter(s => !s.is_terminal).reduce((n, s) => n + s.count, 0),
    totalCandidates:  r.stages.reduce((n, s) => n + s.count, 0),
  }));

  res.json(result);
});

// GET /api/stats/by-hm — per-hiring-manager pipeline breakdown
router.get('/by-hm', requireAuth, (_req, res) => {
  // Flat rows: for each HM × req × stage, candidate count
  const rows = db.prepare(`
    SELECT r.hiring_manager,
           r.id          AS req_id,
           r.title       AS req_title,
           r.status      AS req_status,
           s.id          AS stage_id,
           s.name        AS stage_name,
           s.color,
           s.order_index,
           s.is_terminal,
           s.is_hm_review,
           COUNT(c.id)   AS count
    FROM   reqs r
    LEFT JOIN candidate_reqs cr ON cr.req_id = r.id
    LEFT JOIN candidates c ON c.id = cr.candidate_id
    LEFT JOIN stages s ON c.stage_id = s.id
    WHERE  r.hiring_manager IS NOT NULL AND r.hiring_manager != ''
    GROUP BY r.hiring_manager, r.id, s.id
    ORDER BY r.hiring_manager, r.title, s.order_index
  `).all();

  // HM decisions grouped by hiring_manager name
  const decisions = db.prepare(`
    SELECT r.hiring_manager, n.decision, COUNT(n.id) AS count
    FROM   reqs r
    LEFT JOIN notifications n
      ON n.req_title = r.title
      AND n.type IN ('hm_forward', 'hm_decline')
    WHERE  r.hiring_manager IS NOT NULL AND r.hiring_manager != ''
    GROUP BY r.hiring_manager, n.decision
  `).all();

  // Group: HM → reqs → stages
  const hmMap = new Map();
  for (const row of rows) {
    if (!row.hiring_manager) continue;
    if (!hmMap.has(row.hiring_manager)) {
      hmMap.set(row.hiring_manager, {
        name:       row.hiring_manager,
        reqs:       new Map(),
        hmForward:  0,
        hmDecline:  0,
      });
    }
    const hm = hmMap.get(row.hiring_manager);
    if (!hm.reqs.has(row.req_id)) {
      hm.reqs.set(row.req_id, {
        id:     row.req_id,
        title:  row.req_title,
        status: row.req_status,
        stages: [],
      });
    }
    if (row.stage_id != null) {
      hm.reqs.get(row.req_id).stages.push({
        stage_id:     row.stage_id,
        stage_name:   row.stage_name,
        color:        row.color,
        order_index:  row.order_index,
        is_terminal:  row.is_terminal,
        is_hm_review: row.is_hm_review,
        count:        row.count,
      });
    }
  }

  // Merge HM decisions
  for (const dec of decisions) {
    const hm = hmMap.get(dec.hiring_manager);
    if (!hm) continue;
    if (dec.decision === 'forward') hm.hmForward += dec.count;
    if (dec.decision === 'decline') hm.hmDecline += dec.count;
  }

  // Serialize
  const result = Array.from(hmMap.values()).map(hm => {
    const reqs = Array.from(hm.reqs.values()).map(req => ({
      ...req,
      activeCandidates: req.stages.filter(s => !s.is_terminal).reduce((n, s) => n + s.count, 0),
      awaitingReview:   req.stages.filter(s => s.is_hm_review).reduce((n, s) => n + s.count, 0),
    }));
    const totalActive    = reqs.reduce((n, r) => n + r.activeCandidates, 0);
    const awaitingReview = reqs.reduce((n, r) => n + r.awaitingReview, 0);
    const hmTotal        = hm.hmForward + hm.hmDecline;
    return {
      name:          hm.name,
      reqs,
      openReqs:      reqs.filter(r => r.status === 'open').length,
      totalActive,
      awaitingReview,
      hmForward:     hm.hmForward,
      hmDecline:     hm.hmDecline,
      hmTotal,
      hmForwardRate: hmTotal > 0 ? Math.round((hm.hmForward / hmTotal) * 100) : null,
    };
  });

  res.json(result);
});

module.exports = router;
