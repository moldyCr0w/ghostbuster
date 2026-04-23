#!/usr/bin/env node
/**
 * One-shot script: convert plain-text job descriptions to markdown.
 * Run from the repo root: node scripts/format-job-descriptions.js
 *
 * Safe to re-run — skips rows that already look like markdown.
 */

require('dotenv').config();
const db = require('../server/db');

function toMarkdown(text) {
  if (!text) return text;

  const lines = text.split('\n');
  const out   = [];

  for (const raw of lines) {
    const line = raw.trimEnd();
    const t    = line.trim();

    if (!t) { out.push(''); continue; }

    // Already a markdown heading — leave alone
    if (/^#{1,3}\s/.test(t)) { out.push(line); continue; }

    // Already a markdown bullet — leave alone
    if (/^[-*]\s/.test(t)) { out.push(line); continue; }

    // Bullet characters → markdown bullet
    if (/^[•·◦▪▸▹►]\s*/.test(t)) {
      out.push('- ' + t.replace(/^[•·◦▪▸▹►]\s*/, ''));
      continue;
    }

    // Numbered list (1. or 1) ) — keep as-is, already valid markdown
    if (/^\d+[.)]\s+/.test(t)) { out.push(line); continue; }

    // ALL CAPS line → ## heading (title-cased)
    const isAllCaps = t === t.toUpperCase() && t.length > 3 && /[A-Z]{2}/.test(t) && !/\d{4}/.test(t);
    if (isAllCaps) {
      const heading = t.split(/\s+/)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
      out.push('## ' + heading);
      continue;
    }

    // Short line ending with ':' and no comma → ## heading (strip the colon)
    if (t.endsWith(':') && t.length < 80 && !t.includes(',') && t.split(' ').length <= 8) {
      out.push('## ' + t.slice(0, -1).trim());
      continue;
    }

    out.push(line);
  }

  // Collapse 3+ blank lines → 2
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function looksLikeMarkdown(text) {
  return /^#{1,3}\s|^[-*]\s|\*\*/.test(text);
}

const reqs = db.prepare(
  "SELECT id, title, job_description FROM reqs WHERE job_description IS NOT NULL AND job_description != ''"
).all();

if (reqs.length === 0) {
  console.log('No job descriptions found.');
  process.exit(0);
}

const update = db.prepare('UPDATE reqs SET job_description = ? WHERE id = ?');

let skipped = 0;
let updated = 0;

for (const req of reqs) {
  if (looksLikeMarkdown(req.job_description)) {
    console.log(`  SKIP  [${req.id}] ${req.title} — already markdown`);
    skipped++;
    continue;
  }

  const formatted = toMarkdown(req.job_description);
  update.run(formatted, req.id);
  console.log(`  UPDATE [${req.id}] ${req.title}`);
  updated++;
}

console.log(`\nDone — ${updated} updated, ${skipped} skipped.`);
