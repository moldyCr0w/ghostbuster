# Plan: Video Screen / HM Review Feature

## What We're Building

A "video screen" in the ATS sense: recruiter conducts a screening call, uses Granola/Gemini
to get a notes summary, pastes it in, then sends a clean public link to the hiring manager.
The HM reads the summary, optionally leaves feedback, then clicks **Go** or **No Go** for panel.

---

## Database — new table: `video_screens`

```sql
CREATE TABLE IF NOT EXISTS video_screens (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id  INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  req_id        INTEGER NOT NULL REFERENCES reqs(id)       ON DELETE CASCADE,
  summary       TEXT,           -- recruiter's Granola/Gemini notes paste
  share_token   TEXT UNIQUE,    -- crypto.randomUUID() — drives the public URL
  hm_decision   TEXT,           -- 'go' | 'no_go' | NULL (pending)
  hm_name       TEXT,
  hm_notes      TEXT,
  decided_at    TEXT,
  created_by    TEXT,           -- recruiter name
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now')),
  UNIQUE(candidate_id, req_id)  -- one screen per candidate+req combo
);
```

Migration added to db.js alongside the existing ALTER TABLE pattern.

---

## Backend — `server/routes/screens.js` (new)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET    | `/api/screens/candidate/:cid` | private | All screens for a candidate (recruiter) |
| POST   | `/api/screens` | private | Create screen (candidate_id, req_id, summary, created_by) — generates token |
| PUT    | `/api/screens/:id` | private | Update summary |
| DELETE | `/api/screens/:id` | private | Remove screen |
| GET    | `/api/screens/share/:token` | **public** | Get screen data for HM review page |
| PATCH  | `/api/screens/share/:token/decision` | **public** | Record HM go/no-go + notes |

`server/index.js` gets one new line: `app.use('/api/screens', require('./routes/screens'));`

---

## Public Share Page — `/screen/:token`

Route added to `App.jsx` alongside existing `/login` and `/hm` public routes.

New page: `client/src/pages/ScreenReview.jsx`

**Layout (clean, branded, standalone — no sidebar):**
```
👻 GhostBuster — Candidate Screen Review

  ┌─────────────────────────────────────────────────┐
  │  Jordan Perez                                   │
  │  Senior Product Designer  ·  REQ-2024-011       │
  │  Screen prepared by: Sarah Chen                 │
  └─────────────────────────────────────────────────┘

  ── Screen Summary ──────────────────────────────
  [The recruiter's Granola/Gemini notes, preformatted]

  ── Your Feedback ───────────────────────────────
  Your name: [__________]
  Notes (optional): [textarea]

  [ ✓  Go — Advance to Panel ]   [ ✗  No Go ]

  ── If already decided ──────────────────────────
  ✓ Decision recorded: Go  (Sarah, Jan 15 2025)
  "Strong systems thinking, good culture add."
  [Read-only — decision locked after submission]
```

---

## Recruiter-Side — `ScreenModal.jsx` (new component)

Triggered by a **💬 Screen** button on each row in the Candidates table.

**Modal layout:**
```
Screen Summaries — Jordan Perez
─────────────────────────────────────────────
For each req the candidate is linked to:

  REQ-2024-011 · Senior Product Designer
  ─────────────────────────────────────
  [Paste Granola/Gemini summary here…]
  [ Save ]
  ── after saving ──
  [ 📋 Copy Share Link ]   Status: ⏳ Pending HM review
         or
  Status: ✓ Go (HM: Sarah, Jan 15)
  "Strong systems thinking..."
```

If candidate has no linked reqs → prompts recruiter to link reqs first.

---

## Candidates Page Changes

1. **New "💬 Screen" button** added to each row's action column (between Edit and Delete)
2. **Status badge** on candidate name cell showing aggregate screen status:
   - No screens → nothing shown
   - Any pending → amber `⏳ Screen` pill
   - All go → green `✓ Go` pill
   - Any no-go → red `✗ No Go` pill

---

## Files Changed / Created

| File | Change |
|------|--------|
| `server/db.js` | Add `video_screens` CREATE TABLE + migration |
| `server/routes/screens.js` | **New** — all 6 endpoints |
| `server/index.js` | Mount `/api/screens` |
| `client/src/api.js` | Add `getScreens`, `createScreen`, `updateScreen`, `deleteScreen`, `getSharedScreen`, `submitDecision` |
| `client/src/App.jsx` | Add public `/screen/:token` route |
| `client/src/pages/ScreenReview.jsx` | **New** — public HM review page |
| `client/src/components/ScreenModal.jsx` | **New** — recruiter management modal |
| `client/src/pages/Candidates.jsx` | Add Screen button + status badges |

---

## Data Visibility on Share Page (privacy)

Only exposes: first name + last name, current role field, req title.
Never exposes: email, company, full notes field, LinkedIn URL, resume.

---

## Token Security

- `crypto.randomUUID()` — Node built-in, no new packages
- 128-bit random UUID, globally unique
- Token is set at creation time (available immediately to copy)
- No expiry (HM may need to revisit)
- Decision is locked after submission (shown read-only)
