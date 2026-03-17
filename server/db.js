const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'ghostbuster.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS stages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL UNIQUE,
    order_index INTEGER NOT NULL,
    color       TEXT    DEFAULT '#6B7280',
    is_terminal INTEGER DEFAULT 0,
    is_hire     INTEGER DEFAULT 0
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

// Stages migrations
['is_hire INTEGER DEFAULT 0'].forEach(col => {
  try { db.exec(`ALTER TABLE stages ADD COLUMN ${col}`); } catch (_) {}
});

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
    'INSERT INTO stages (name, order_index, color, is_terminal, is_hire) VALUES (?, ?, ?, ?, ?)'
  );
  [
    // name,                     order, color,      terminal, hire
    ['Applied',                  1, '#6B7280', 0, 0],
    ['Phone Screen',             2, '#3B82F6', 0, 0],
    ['Technical Interview',      3, '#8B5CF6', 0, 0],
    ['Onsite / Final Interview', 4, '#F59E0B', 0, 0],
    ['Offer',                    5, '#10B981', 0, 0],
    ['Hired',                    6, '#22C55E', 1, 1],
    ['Rejected / Closed',        7, '#EF4444', 1, 0],
  ].forEach(row => ins.run(...row));
}

// For existing databases: seed the "Hired" stage if it doesn't exist
const hiredStage = db.prepare("SELECT id FROM stages WHERE is_hire = 1").get();
if (!hiredStage) {
  const maxOrder = db.prepare('SELECT MAX(order_index) as m FROM stages').get().m || 0;
  db.prepare(
    'INSERT INTO stages (name, order_index, color, is_terminal, is_hire) VALUES (?, ?, ?, ?, ?)'
  ).run('Hired', maxOrder + 1, '#22C55E', 1, 1);
}

module.exports = db;
