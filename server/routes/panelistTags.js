const express     = require('express');
const router      = express.Router();
const db          = require('../db');
const requireAuth = require('../middleware/requireAuth');

// GET /api/panelist-tags
router.get('/', requireAuth, (_req, res) => {
  const tags = db.prepare(`
    SELECT * FROM panelist_tags ORDER BY category, name
  `).all();
  res.json(tags);
});

// POST /api/panelist-tags
router.post('/', requireAuth, (req, res) => {
  const { name, category = 'other', color = '#6B7280' } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
  try {
    const result = db.prepare(
      'INSERT INTO panelist_tags (name, category, color) VALUES (?, ?, ?)'
    ).run(name.trim(), category, color);
    res.json(db.prepare('SELECT * FROM panelist_tags WHERE id = ?').get(result.lastInsertRowid));
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'A tag with that name already exists' });
    throw e;
  }
});

// PUT /api/panelist-tags/:id
router.put('/:id', requireAuth, (req, res) => {
  const { name, category, color } = req.body;
  const tag = db.prepare('SELECT * FROM panelist_tags WHERE id = ?').get(req.params.id);
  if (!tag) return res.status(404).json({ error: 'Not found' });
  try {
    db.prepare('UPDATE panelist_tags SET name = ?, category = ?, color = ? WHERE id = ?')
      .run(name ?? tag.name, category ?? tag.category, color ?? tag.color, req.params.id);
    res.json(db.prepare('SELECT * FROM panelist_tags WHERE id = ?').get(req.params.id));
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'A tag with that name already exists' });
    throw e;
  }
});

// DELETE /api/panelist-tags/:id
router.delete('/:id', requireAuth, (req, res) => {
  const tag = db.prepare('SELECT * FROM panelist_tags WHERE id = ?').get(req.params.id);
  if (!tag) return res.status(404).json({ error: 'Not found' });

  // Remove this tag ID from all panelists' qualifications JSON arrays
  const panelists = db.prepare('SELECT id, qualifications FROM panelists').all();
  const update    = db.prepare('UPDATE panelists SET qualifications = ? WHERE id = ?');
  const tagId     = Number(req.params.id);
  db.transaction(() => {
    panelists.forEach(p => {
      const quals = JSON.parse(p.qualifications || '[]').filter(id => id !== tagId);
      update.run(JSON.stringify(quals), p.id);
    });
    db.prepare('DELETE FROM panelist_tags WHERE id = ?').run(req.params.id);
  })();

  res.json({ ok: true });
});

module.exports = router;
