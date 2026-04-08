const express     = require('express');
const router      = express.Router();
const db          = require('../db');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');

const VALID_LEVELS = ['senior', 'staff_plus'];

// Expand tag IDs in a panelist row to full tag objects for the response.
function expandTags(panelist) {
  const tagIds     = JSON.parse(panelist.qualifications  || '[]');
  const levels     = JSON.parse(panelist.interview_levels || '[]');
  const allTags    = db.prepare('SELECT * FROM panelist_tags').all();
  const tagMap     = Object.fromEntries(allTags.map(t => [t.id, t]));

  return {
    ...panelist,
    qualifications:   tagIds.map(id => tagMap[id]).filter(Boolean),
    interview_levels: levels,
  };
}

// GET /api/panelists
// Optional filters: ?tag_ids=1,3  ?level=senior
router.get('/', requireAuth, (req, res) => {
  let panelists = db.prepare('SELECT * FROM panelists ORDER BY name').all();

  // Filter by required tag IDs
  if (req.query.tag_ids) {
    const required = req.query.tag_ids.split(',').map(Number);
    panelists = panelists.filter(p => {
      const quals = JSON.parse(p.qualifications || '[]');
      return required.every(id => quals.includes(id));
    });
  }

  // Filter by interview level
  if (req.query.level) {
    panelists = panelists.filter(p => {
      const levels = JSON.parse(p.interview_levels || '[]');
      return levels.includes(req.query.level);
    });
  }

  res.json(panelists.map(expandTags));
});

// GET /api/panelists/:id
router.get('/:id', requireAuth, (req, res) => {
  const p = db.prepare('SELECT * FROM panelists WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  res.json(expandTags(p));
});

// POST /api/panelists  — senior_recruiter+
router.post('/', requireAuth, requireRole('senior_recruiter'), (req, res) => {
  const { name, email, title = '', qualifications = [], interview_levels = [] } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
  if (!email?.trim()) return res.status(400).json({ error: 'Email is required' });

  const levels = interview_levels.filter(l => VALID_LEVELS.includes(l));

  try {
    const result = db.prepare(
      'INSERT INTO panelists (name, email, title, qualifications, interview_levels) VALUES (?, ?, ?, ?, ?)'
    ).run(
      name.trim(), email.trim().toLowerCase(), title.trim(),
      JSON.stringify(qualifications),
      JSON.stringify(levels)
    );
    res.json(expandTags(db.prepare('SELECT * FROM panelists WHERE id = ?').get(result.lastInsertRowid)));
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'A panelist with that email already exists' });
    throw e;
  }
});

// PUT /api/panelists/:id  — senior_recruiter+
router.put('/:id', requireAuth, requireRole('senior_recruiter'), (req, res) => {
  const existing = db.prepare('SELECT * FROM panelists WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const {
    name             = existing.name,
    email            = existing.email,
    title            = existing.title,
    qualifications   = JSON.parse(existing.qualifications),
    interview_levels = JSON.parse(existing.interview_levels),
  } = req.body;

  const levels = interview_levels.filter(l => VALID_LEVELS.includes(l));

  try {
    db.prepare(
      'UPDATE panelists SET name = ?, email = ?, title = ?, qualifications = ?, interview_levels = ? WHERE id = ?'
    ).run(
      name.trim(), email.trim().toLowerCase(), title?.trim() ?? '',
      JSON.stringify(qualifications),
      JSON.stringify(levels),
      req.params.id
    );
    res.json(expandTags(db.prepare('SELECT * FROM panelists WHERE id = ?').get(req.params.id)));
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'A panelist with that email already exists' });
    throw e;
  }
});

// DELETE /api/panelists/:id  — senior_recruiter+
router.delete('/:id', requireAuth, requireRole('senior_recruiter'), (req, res) => {
  const result = db.prepare('DELETE FROM panelists WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = router;
