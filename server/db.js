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
  'stage_entered_at       TEXT',
  'sla_reset_at           TEXT',
  'first_name             TEXT',
  'last_name              TEXT',
  'linkedin_url           TEXT',
  'wd_url                 TEXT',
  'resume_path            TEXT',
  'resume_original_name   TEXT',
  'hired_for_req_id       INTEGER',
  'pending_next_stage_id  INTEGER REFERENCES stages(id)',
  'pending_reason         TEXT',
  'card_sub_status        TEXT',
  'stage_event_date       TEXT',
].forEach(col => {
  try { db.exec(`ALTER TABLE candidates ADD COLUMN ${col}`); } catch (_) {}
});

// Reqs migrations
['hiring_manager TEXT', 'recruiter TEXT', 'script_doc_url TEXT', 'job_description TEXT', 'public_token TEXT', 'is_public INTEGER DEFAULT 0'].forEach(col => {
  try { db.exec(`ALTER TABLE reqs ADD COLUMN ${col}`); } catch (_) {}
});

// Stages migrations
['is_hire INTEGER DEFAULT 0', 'is_hm_review INTEGER DEFAULT 0', 'is_withdraw INTEGER DEFAULT 0'].forEach(col => {
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

// Back-fill hm_forward notifications for candidates manually moved past HM Review
// (e.g. during Slack → Ghostbuster transition). Idempotent — skips any candidate
// that already has an hm_forward or hm_decline notification.
try {
  const hmStage = db.prepare("SELECT id, order_index, name FROM stages WHERE is_hm_review = 1").get();
  if (hmStage) {
    const alreadyNotified = new Set(
      db.prepare("SELECT candidate_id FROM notifications WHERE type = 'hm_forward' OR type = 'hm_decline'")
        .all().map(r => r.candidate_id)
    );
    const toBackfill = db.prepare(`
      SELECT
        c.id,
        COALESCE(
          NULLIF(TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')), ''),
          c.name
        ) AS candidate_name
      FROM  candidates c
      JOIN  stages s ON c.stage_id = s.id
      WHERE s.order_index > ${hmStage.order_index}
        AND NOT (s.is_terminal = 1 AND s.is_hire = 0)
    `).all().filter(c => !alreadyNotified.has(c.id));

    if (toBackfill.length > 0) {
      const insert = db.prepare(`
        INSERT INTO notifications (type, candidate_id, candidate_name, stage_name, decision)
        VALUES ('hm_forward', ?, ?, ?, 'forward')
      `);
      const run = db.transaction(() => {
        toBackfill.forEach(c => insert.run(c.id, c.candidate_name, hmStage.name));
      });
      run();
      console.log(`[db] Backfilled ${toBackfill.length} hm_forward notification(s) for manually-moved candidates.`);
    }
  }
} catch (e) { console.error('[db] hm_forward backfill error:', e.message); }

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
    ['Hired',                              7, '#22C55E', 1, 1, 0],
    ['Rejected / Closed',                  8, '#EF4444', 1, 0, 0],
    ['Candidate Withdrew / Declined',      9, '#94A3B8', 1, 0, 0],
  ].forEach(row => ins.run(...row));
  // Mark the withdraw stage
  db.prepare("UPDATE stages SET is_withdraw = 1 WHERE name = 'Candidate Withdrew / Declined'").run();
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

// For existing databases: seed the "Candidate Withdrew / Declined" stage if it doesn't exist
const withdrawStageExists = db.prepare("SELECT id FROM stages WHERE is_withdraw = 1").get();
if (!withdrawStageExists) {
  const maxOrder = db.prepare('SELECT MAX(order_index) as m FROM stages').get().m || 0;
  db.prepare(
    "INSERT OR IGNORE INTO stages (name, order_index, color, is_terminal, is_hire, is_hm_review, is_withdraw) VALUES (?, ?, '#94A3B8', 1, 0, 0, 1)"
  ).run('Candidate Withdrew / Declined', maxOrder + 1);
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

// Workday headcount slots per req
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS req_wd_slots (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      req_id       INTEGER NOT NULL REFERENCES reqs(id) ON DELETE CASCADE,
      wd_req_id    TEXT    NOT NULL,
      label        TEXT,
      status       TEXT    NOT NULL DEFAULT 'open',
      candidate_id INTEGER REFERENCES candidates(id) ON DELETE SET NULL,
      pushed_at    TEXT,
      created_at   TEXT    DEFAULT (datetime('now'))
    );
  `);
} catch (_) {}

// Workday sync state on candidates
[
  'wd_applicant_id  TEXT',
  'wd_sync_status   TEXT',
  'wd_synced_at     TEXT',
  'wd_sync_error    TEXT',
  'wd_pushed_req_id TEXT',
].forEach(col => {
  try { db.exec(`ALTER TABLE candidates ADD COLUMN ${col}`); } catch (_) {}
});

// Panelist qualification tags (recruiter-defined tag library)
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS panelist_tags (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL UNIQUE,
      category   TEXT    NOT NULL DEFAULT 'other',
      color      TEXT    NOT NULL DEFAULT '#6B7280',
      created_at TEXT    DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS panelists (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      name             TEXT    NOT NULL,
      email            TEXT    NOT NULL UNIQUE,
      title            TEXT,
      qualifications   TEXT    NOT NULL DEFAULT '[]',
      interview_levels TEXT    NOT NULL DEFAULT '[]',
      created_at       TEXT    DEFAULT (datetime('now'))
    );
  `);
} catch (_) {}

// Interview scheduling links
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schedule_links (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      token            TEXT    NOT NULL UNIQUE,
      candidate_id     INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      created_by       INTEGER REFERENCES users(id),
      req_id           INTEGER REFERENCES reqs(id) ON DELETE SET NULL,
      mode             TEXT    NOT NULL DEFAULT 'self-schedule',
      status           TEXT    NOT NULL DEFAULT 'pending',
      panelist_emails  TEXT    NOT NULL DEFAULT '[]',
      duration_mins    INTEGER NOT NULL DEFAULT 60,
      window_start     TEXT,
      window_end       TEXT,
      proposed_start   TEXT,
      proposed_end     TEXT,
      interview_title  TEXT,
      event_id         TEXT,
      event_start      TEXT,
      event_end        TEXT,
      meet_link        TEXT,
      booked_by_name   TEXT,
      booked_by_email  TEXT,
      created_at       TEXT    DEFAULT (datetime('now')),
      booked_at        TEXT
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

// Track when the 24-hour HM reminder was sent (reset when candidate leaves HM Review)
try { db.exec('ALTER TABLE candidates ADD COLUMN hm_reminder_sent_at TEXT'); } catch (_) {}

// Interview types (configurable panel interview definitions)
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS interview_types (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      name              TEXT    NOT NULL UNIQUE,
      duration_mins     INTEGER NOT NULL DEFAULT 60,
      level_requirement TEXT    NOT NULL DEFAULT 'senior',
      required_tag_id   INTEGER REFERENCES panelist_tags(id) ON DELETE SET NULL,
      min_panelists     INTEGER NOT NULL DEFAULT 2,
      order_index       INTEGER NOT NULL DEFAULT 0,
      category          TEXT    NOT NULL DEFAULT 'custom',
      stack             TEXT,
      whiteboard_url    TEXT,
      created_at        TEXT    DEFAULT (datetime('now'))
    );
  `);
  const itCount = db.prepare('SELECT COUNT(*) as c FROM interview_types').get().c;
  if (itCount === 0) {
    // Seed stack qualification tags first so pair coding types can reference them
    const insTag = db.prepare("INSERT OR IGNORE INTO panelist_tags (name, category, color) VALUES (?, 'stack', ?)");
    insTag.run('TypeScript', '#3178C6');
    insTag.run('Elixir',     '#6E4FA4');
    const tsTag = db.prepare("SELECT id FROM panelist_tags WHERE name = 'TypeScript'").get();
    const elTag = db.prepare("SELECT id FROM panelist_tags WHERE name = 'Elixir'").get();

    const ins = db.prepare(
      'INSERT INTO interview_types (name, category, stack, whiteboard_url, duration_mins, level_requirement, required_tag_id, min_panelists, order_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    // name, category, stack, whiteboard_url, duration_mins, level_requirement, required_tag_id, min_panelists, order_index
    [
      ['Hiring Manager',                    'hm',                   null,         null,                        60, 'senior',     null,        1, 1],
      ['Pair Coding – TypeScript – Senior', 'pair_coding',          'typescript', null,                        90, 'senior',     tsTag.id,    2, 2],
      ['Pair Coding – TypeScript – Staff+', 'pair_coding',          'typescript', null,                        90, 'staff_plus', tsTag.id,    2, 3],
      ['Pair Coding – Elixir – Senior',     'pair_coding',          'elixir',     null,                        90, 'senior',     elTag.id,    2, 4],
      ['Pair Coding – Elixir – Staff+',     'pair_coding',          'elixir',     null,                        90, 'staff_plus', elTag.id,    2, 5],
      ['Architectural Design',              'architectural_design',  null,         'https://www.tldraw.com/',   90, 'staff_plus', null,        2, 6],
      ['Engineering Manager + PM',          'em_pm',                null,         null,                        60, 'staff_plus', null,        2, 7],
    ].forEach(row => ins.run(...row));
  }
} catch (_) {}

// Add interview_type_id to schedule_links (links a link to a specific interview type for round-robin)
try {
  db.prepare('ALTER TABLE schedule_links ADD COLUMN interview_type_id INTEGER REFERENCES interview_types(id) ON DELETE SET NULL').run();
} catch (_) {}

// Add req_id to schedule_links (tracks which req this interview is for)
try {
  db.prepare('ALTER TABLE schedule_links ADD COLUMN req_id INTEGER REFERENCES reqs(id) ON DELETE SET NULL').run();
} catch (_) {}

// Add category, stack, whiteboard_url to interview_types (for existing databases)
try { db.prepare("ALTER TABLE interview_types ADD COLUMN category TEXT NOT NULL DEFAULT 'custom'").run(); } catch (_) {}
try { db.prepare('ALTER TABLE interview_types ADD COLUMN stack TEXT').run(); } catch (_) {}
try { db.prepare('ALTER TABLE interview_types ADD COLUMN whiteboard_url TEXT').run(); } catch (_) {}

// Backfill interview_types: set category, stack, duration, and whiteboard for existing records
try {
  db.exec(`
    UPDATE interview_types SET category = 'hm'                   WHERE category = 'custom' AND name LIKE '%Hiring Manager%';
    UPDATE interview_types SET category = 'pair_coding'           WHERE category = 'custom' AND name LIKE '%Pair Coding%';
    UPDATE interview_types SET category = 'architectural_design'  WHERE category = 'custom' AND name LIKE '%Architectural%';
    UPDATE interview_types SET category = 'em_pm'                 WHERE category = 'custom' AND (name LIKE '%Manager + PM%' OR name LIKE '%EM%PM%');
    UPDATE interview_types SET stack = 'typescript' WHERE category = 'pair_coding' AND name LIKE '%TypeScript%';
    UPDATE interview_types SET stack = 'elixir'     WHERE category = 'pair_coding' AND name LIKE '%Elixir%';
    UPDATE interview_types SET duration_mins = 90   WHERE category = 'pair_coding' AND duration_mins < 90;
    UPDATE interview_types SET whiteboard_url = 'https://www.tldraw.com/' WHERE category = 'architectural_design' AND whiteboard_url IS NULL;
  `);
} catch (_) {}

// Add Staff+ pair coding variants for existing databases (INSERT OR IGNORE respects UNIQUE name constraint)
try {
  const maxOrd = db.prepare('SELECT MAX(order_index) as m FROM interview_types').get().m || 0;
  const insV   = db.prepare(
    "INSERT OR IGNORE INTO interview_types (name, category, stack, duration_mins, level_requirement, min_panelists, order_index) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  db.transaction(() => {
    insV.run('Pair Coding – TypeScript – Staff+', 'pair_coding', 'typescript', 90, 'staff_plus', 2, maxOrd + 1);
    insV.run('Pair Coding – Elixir – Staff+',     'pair_coding', 'elixir',     90, 'staff_plus', 2, maxOrd + 2);
  })();
} catch (_) {}

// Backfill panelist interview_levels: collapse 5-tier → 2-tier (senior, staff_plus)
try {
  const rows = db.prepare('SELECT id, interview_levels FROM panelists').all();
  const upd  = db.prepare('UPDATE panelists SET interview_levels = ? WHERE id = ?');
  db.transaction(() => {
    rows.forEach(p => {
      const old      = JSON.parse(p.interview_levels || '[]');
      const remapped = [];
      if (old.includes('senior')) remapped.push('senior');
      if ((old.includes('staff') || old.includes('principal')) && !remapped.includes('staff_plus'))
        remapped.push('staff_plus');
      upd.run(JSON.stringify(remapped), p.id);
    });
  })();
} catch (_) {}

// Seed TypeScript/Elixir stack tags and link them to pair coding interview types (existing DBs)
try {
  db.prepare("INSERT OR IGNORE INTO panelist_tags (name, category, color) VALUES ('TypeScript', 'stack', '#3178C6')").run();
  db.prepare("INSERT OR IGNORE INTO panelist_tags (name, category, color) VALUES ('Elixir',     'stack', '#6E4FA4')").run();
  const tsId = db.prepare("SELECT id FROM panelist_tags WHERE name = 'TypeScript'").get()?.id;
  const elId = db.prepare("SELECT id FROM panelist_tags WHERE name = 'Elixir'").get()?.id;
  if (tsId) db.prepare("UPDATE interview_types SET required_tag_id = ? WHERE category = 'pair_coding' AND stack = 'typescript' AND required_tag_id IS NULL").run(tsId);
  if (elId) db.prepare("UPDATE interview_types SET required_tag_id = ? WHERE category = 'pair_coding' AND stack = 'elixir'     AND required_tag_id IS NULL").run(elId);
} catch (_) {}

// Feature: Pending Scheduling half-stage
try { db.prepare('ALTER TABLE stages ADD COLUMN requires_scheduling INTEGER DEFAULT 0').run(); } catch (_) {}
try { db.prepare('ALTER TABLE candidates ADD COLUMN schedule_pending INTEGER DEFAULT 0').run(); } catch (_) {}

// Feature: Per-req interview plans
db.exec(`
  CREATE TABLE IF NOT EXISTS req_interview_plans (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    req_id            INTEGER NOT NULL REFERENCES reqs(id) ON DELETE CASCADE,
    stage_id          INTEGER NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
    interview_name    TEXT    NOT NULL,
    interview_type_id INTEGER REFERENCES interview_types(id),
    notes             TEXT,
    order_index       INTEGER NOT NULL DEFAULT 0,
    UNIQUE(req_id, stage_id)
  );
`);

// Feature: Pokédex knowledge hub
db.exec(`
  CREATE TABLE IF NOT EXISTS pokedex_categories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL UNIQUE,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS pokedex_entries (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL REFERENCES pokedex_categories(id) ON DELETE CASCADE,
    type        TEXT    NOT NULL CHECK(type IN ('link', 'note')),
    title       TEXT    NOT NULL,
    body        TEXT,
    url         TEXT,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_by  INTEGER REFERENCES users(id),
    created_at  TEXT    DEFAULT (datetime('now')),
    updated_at  TEXT    DEFAULT (datetime('now'))
  );
`);

module.exports = db;
