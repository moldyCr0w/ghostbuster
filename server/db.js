const Database = require('better-sqlite3');
const path = require('path');
const fs   = require('fs');

// In production (Railway) DB_PATH points to the persistent volume.
// Locally it falls back to the repo root.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'ghostbuster.db');

// Make sure the parent directory exists (important on first deploy)
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    email      TEXT    NOT NULL UNIQUE,
    role       TEXT    NOT NULL DEFAULT 'recruiter',
    created_at TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS magic_tokens (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    email      TEXT    NOT NULL,
    pin        TEXT    NOT NULL,
    expires_at TEXT    NOT NULL,
    used       INTEGER DEFAULT 0,
    created_at TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS stages (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT    NOT NULL UNIQUE,
    order_index  INTEGER NOT NULL,
    color        TEXT    DEFAULT '#6B7280',
    is_terminal  INTEGER DEFAULT 0,
    is_hire      INTEGER DEFAULT 0,
    is_hm_review INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS reqs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    req_id     TEXT    NOT NULL UNIQUE,
    title      TEXT    NOT NULL,
    department TEXT,
    status     TEXT    NOT NULL DEFAULT 'open'
  );

  CREATE TABLE IF NOT EXISTS candidates (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    name             TEXT    NOT NULL,
    email            TEXT,
    role             TEXT,
    company          TEXT,
    stage_id         INTEGER NOT NULL REFERENCES stages(id),
    next_step        TEXT,
    next_step_due    TEXT,
    notes            TEXT,
    stage_entered_at TEXT    DEFAULT (datetime('now')),
    sla_reset_at     TEXT,
    created_at       TEXT    DEFAULT (datetime('now')),
    updated_at       TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS candidate_reqs (
    candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    req_id       INTEGER NOT NULL REFERENCES reqs(id)       ON DELETE CASCADE,
    PRIMARY KEY (candidate_id, req_id)
  );

  CREATE TABLE IF NOT EXISTS scorecard_criteria (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    req_id      INTEGER NOT NULL REFERENCES reqs(id) ON DELETE CASCADE,
    name        TEXT    NOT NULL,
    order_index INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS candidate_scores (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    candidate_id  INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    req_id        INTEGER NOT NULL REFERENCES reqs(id)       ON DELETE CASCADE,
    criterion_id  INTEGER NOT NULL REFERENCES scorecard_criteria(id) ON DELETE CASCADE,
    score         INTEGER NOT NULL CHECK(score >= 1 AND score <= 5),
    scored_by     TEXT,
    scored_at     TEXT    DEFAULT (datetime('now')),
    UNIQUE(candidate_id, req_id, criterion_id)
  );

  CREATE TABLE IF NOT EXISTS video_screen_notes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    candidate_id  INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    note          TEXT    NOT NULL,
    author        TEXT,
    created_at    TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    type           TEXT    NOT NULL,
    candidate_id   INTEGER REFERENCES candidates(id) ON DELETE CASCADE,
    candidate_name TEXT    NOT NULL,
    req_title      TEXT,
    stage_name     TEXT,
    decision       TEXT    NOT NULL,
    is_read        INTEGER DEFAULT 0,
    created_at     TEXT    DEFAULT (datetime('now'))
  );
`);

// Safe migrations for existing databases (no-op if columns already exist)
[
  'stage_entered_at     TEXT',
  'sla_reset_at         TEXT',
  'first_name           TEXT',
  'last_name            TEXT',
  'linkedin_url         TEXT',
  'wd_url               TEXT',
  'resume_path          TEXT',
  'resume_original_name TEXT',
  'hired_for_req_id     INTEGER',
].forEach(col => {
  try { db.exec(`ALTER TABLE candidates ADD COLUMN ${col}`); } catch (_) {}
});

// Reqs migrations
['hiring_manager TEXT', 'recruiter TEXT', 'script_doc_url TEXT'].forEach(col => {
  try { db.exec(`ALTER TABLE reqs ADD COLUMN ${col}`); } catch (_) {}
});

// Stages migrations
['is_hire INTEGER DEFAULT 0', 'is_hm_review INTEGER DEFAULT 0'].forEach(col => {
  try { db.exec(`ALTER TABLE stages ADD COLUMN ${col}`); } catch (_) {}
});

// candidate_reqs migrations
try { db.exec('ALTER TABLE candidate_reqs ADD COLUMN sourced_by INTEGER REFERENCES users(id)'); } catch (_) {}

// notifications migrations
try { db.exec('ALTER TABLE notifications ADD COLUMN target_user_id INTEGER'); } catch (_) {}

// Back-fill first_name from name for any existing rows
db.exec(`
  UPDATE candidates
  SET first_name = name
  WHERE first_name IS NULL AND name IS NOT NULL
`);

// Seed default stages (only on fresh database)
const stageCount = db.prepare('SELECT COUNT(*) as c FROM stages').get().c;
if (stageCount === 0) {
  const ins = db.prepare(
    'INSERT INTO stages (name, order_index, color, is_terminal, is_hire, is_hm_review) VALUES (?, ?, ?, ?, ?, ?)'
  );
  [
    // name,                     order, color,      terminal, hire, hm_review
    ['Applied',                  1, '#6B7280', 0, 0, 0],
    ['Phone Screen',             2, '#3B82F6', 0, 0, 0],
    ['HM Review',                3, '#F97316', 0, 0, 1],
    ['Technical Interview',      4, '#8B5CF6', 0, 0, 0],
    ['Onsite / Final Interview', 5, '#F59E0B', 0, 0, 0],
    ['Offer',                    6, '#10B981', 0, 0, 0],
    ['Hired',                    7, '#22C55E', 1, 1, 0],
    ['Rejected / Closed',        8, '#EF4444', 1, 0, 0],
  ].forEach(row => ins.run(...row));
}

// For existing databases: seed the "Hired" stage if it doesn't exist
const hiredStage = db.prepare("SELECT id FROM stages WHERE is_hire = 1").get();
if (!hiredStage) {
  const maxOrder = db.prepare('SELECT MAX(order_index) as m FROM stages').get().m || 0;
  db.prepare(
    'INSERT INTO stages (name, order_index, color, is_terminal, is_hire, is_hm_review) VALUES (?, ?, ?, ?, ?, ?)'
  ).run('Hired', maxOrder + 1, '#22C55E', 1, 1, 0);
}

// For existing databases: seed the "HM Review" stage if it doesn't exist
const hmReviewStageExists = db.prepare("SELECT id FROM stages WHERE is_hm_review = 1").get();
if (!hmReviewStageExists) {
  // Insert after Phone Screen (order 2) if it exists, otherwise at position 3
  const phoneScreen = db.prepare("SELECT order_index FROM stages WHERE name = 'Phone Screen'").get();
  const insertAt    = phoneScreen ? phoneScreen.order_index + 1 : 3;
  // Shift all stages at that position and above up by one
  db.prepare("UPDATE stages SET order_index = order_index + 1 WHERE order_index >= ?").run(insertAt);
  db.prepare(
    "INSERT OR IGNORE INTO stages (name, order_index, color, is_terminal, is_hire, is_hm_review) VALUES (?, ?, '#F97316', 0, 0, 1)"
  ).run('HM Review', insertAt);
}

// Settings table (key/value store)
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `);
} catch (_) {}

// Individual HM user accounts (replaces shared PIN)
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS hm_users (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL,
      email      TEXT    NOT NULL UNIQUE,
      created_at TEXT    DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS hm_magic_tokens (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      email      TEXT    NOT NULL,
      pin        TEXT    NOT NULL,
      expires_at TEXT    NOT NULL,
      used       INTEGER DEFAULT 0,
      created_at TEXT    DEFAULT (datetime('now'))
    );
  `);
} catch (_) {}

// Audit trail: record which HM made the forward/decline decision
try { db.exec('ALTER TABLE candidates ADD COLUMN hm_decided_by TEXT'); } catch (_) {}

module.exports = db;
