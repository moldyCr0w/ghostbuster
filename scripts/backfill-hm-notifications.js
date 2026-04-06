#!/usr/bin/env node
/**
 * backfill-hm-notifications.js
 *
 * One-time script: insert synthetic hm_forward notifications for candidates
 * who were manually moved past HM Review (e.g. during the Slack → Ghostbuster
 * transition) without ever going through the HM portal flow.
 *
 * Safe to run multiple times — skips any candidate that already has an
 * hm_forward or hm_decline notification.
 *
 * Usage:
 *   node scripts/backfill-hm-notifications.js          # dry-run (preview only)
 *   node scripts/backfill-hm-notifications.js --commit  # write to DB
 */

const db    = require('../server/db');
const DRY   = !process.argv.includes('--commit');

if (DRY) {
  console.log('DRY RUN — pass --commit to write changes.\n');
}

// ── Find the HM Review stage ──────────────────────────────────────────────────
const hmStage = db.prepare("SELECT id, order_index, name FROM stages WHERE is_hm_review = 1").get();
if (!hmStage) {
  console.error('ERROR: No stage with is_hm_review = 1 found. Nothing to do.');
  process.exit(1);
}
console.log(`HM Review stage: "${hmStage.name}" (order_index=${hmStage.order_index})\n`);

// ── Find candidates to backfill ───────────────────────────────────────────────
// Criteria:
//   • Currently in a stage with order_index > HM Review's order_index
//   • Not in a "Rejected / Closed" terminal stage (is_terminal=1, is_hire=0)
//   • Have NO existing hm_forward or hm_decline notification
const hmIdx = hmStage.order_index;

// IDs that already have an HM notification
const alreadyNotified = new Set(
  db.prepare(`SELECT candidate_id FROM notifications WHERE type = 'hm_forward' OR type = 'hm_decline'`)
    .all().map(r => r.candidate_id)
);

// All candidates in post-HM stages (excluding Rejected/Closed)
const allPast = db.prepare(`
  SELECT
    c.id,
    COALESCE(
      NULLIF(TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')), ''),
      c.name
    ) AS candidate_name,
    s.name AS current_stage
  FROM  candidates c
  JOIN  stages s ON c.stage_id = s.id
  WHERE s.order_index > ${hmIdx}
    AND NOT (s.is_terminal = 1 AND s.is_hire = 0)
  ORDER BY c.id
`).all();

// Attach req title (avoid fan-out: take first req per candidate)
const reqForCandidate = db.prepare(`
  SELECT cr.candidate_id, r.title
  FROM   candidate_reqs cr
  JOIN   reqs r ON r.id = cr.req_id
  WHERE  cr.candidate_id = ?
  ORDER  BY cr.req_id DESC
  LIMIT  1
`);

const candidates = allPast
  .filter(c => !alreadyNotified.has(c.id))
  .map(c => {
    const req = reqForCandidate.get(c.id);
    return { ...c, req_title: req?.title || null };
  });

if (candidates.length === 0) {
  console.log('Nothing to backfill — all candidates past HM Review already have a notification.');
  process.exit(0);
}

console.log(`Found ${candidates.length} candidate(s) missing an hm_forward notification:\n`);
candidates.forEach(c => {
  console.log(`  [id=${c.id}] ${c.candidate_name}  |  stage: ${c.current_stage}  |  req: ${c.req_title || '(none)'}`);
});
console.log('');

if (DRY) {
  console.log('Re-run with --commit to insert these notifications.');
  process.exit(0);
}

// ── Insert synthetic hm_forward notifications ─────────────────────────────────
const insert = db.prepare(`
  INSERT INTO notifications
    (type, candidate_id, candidate_name, req_title, stage_name, decision)
  VALUES
    ('hm_forward', ?, ?, ?, ?, 'forward')
`);

const run = db.transaction(() => {
  candidates.forEach(c => {
    insert.run(c.id, c.candidate_name, c.req_title || null, hmStage.name);
  });
});

run();
console.log(`Done. Inserted ${candidates.length} hm_forward notification(s).`);
