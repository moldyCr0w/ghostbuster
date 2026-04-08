const express     = require('express');
const router      = express.Router();
const db          = require('../db');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');

// GET /api/pokedex — all categories with nested entries (any authenticated user)
router.get('/', requireAuth, (req, res) => {
  const categories = db.prepare(
    'SELECT * FROM pokedex_categories ORDER BY order_index, name'
  ).all();
  const entries = db.prepare(
    'SELECT * FROM pokedex_entries ORDER BY order_index, created_at'
  ).all();

  const entryMap = {};
  for (const e of entries) {
    if (!entryMap[e.category_id]) entryMap[e.category_id] = [];
    entryMap[e.category_id].push(e);
  }

  res.json(categories.map(c => ({ ...c, entries: entryMap[c.id] || [] })));
});

// POST /api/pokedex/categories — senior_recruiter+
router.post('/categories', requireAuth, requireRole('senior_recruiter'), (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  const maxOrder = db.prepare('SELECT MAX(order_index) as m FROM pokedex_categories').get().m ?? 0;
  try {
    const r = db.prepare(
      'INSERT INTO pokedex_categories (name, order_index) VALUES (?, ?)'
    ).run(name.trim(), maxOrder + 1);
    res.status(201).json({ id: r.lastInsertRowid });
  } catch (err) {
    if (err.message.includes('UNIQUE'))
      return res.status(400).json({ error: 'A category with that name already exists' });
    throw err;
  }
});

// PUT /api/pokedex/categories/:id — senior_recruiter+
router.put('/categories/:id', requireAuth, requireRole('senior_recruiter'), (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  try {
    const result = db.prepare('UPDATE pokedex_categories SET name=? WHERE id=?').run(name.trim(), req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    if (err.message.includes('UNIQUE'))
      return res.status(400).json({ error: 'A category with that name already exists' });
    throw err;
  }
});

// DELETE /api/pokedex/categories/:id — senior_recruiter+ (cascades to entries)
router.delete('/categories/:id', requireAuth, requireRole('senior_recruiter'), (req, res) => {
  const result = db.prepare('DELETE FROM pokedex_categories WHERE id=?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

// POST /api/pokedex/entries — senior_recruiter+
router.post('/entries', requireAuth, requireRole('senior_recruiter'), (req, res) => {
  const { category_id, type, title, body, url } = req.body;
  if (!category_id)    return res.status(400).json({ error: 'category_id is required' });
  if (!['link', 'note'].includes(type)) return res.status(400).json({ error: 'type must be link or note' });
  if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
  if (type === 'link' && !url?.trim()) return res.status(400).json({ error: 'url is required for link entries' });

  const maxOrder = db.prepare(
    'SELECT MAX(order_index) as m FROM pokedex_entries WHERE category_id = ?'
  ).get(category_id).m ?? 0;

  const r = db.prepare(`
    INSERT INTO pokedex_entries (category_id, type, title, body, url, order_index, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(category_id, type, title.trim(), body || null, url?.trim() || null, maxOrder + 1, req.user?.id || null);

  res.status(201).json({ id: r.lastInsertRowid });
});

// PUT /api/pokedex/entries/:id — senior_recruiter+
router.put('/entries/:id', requireAuth, requireRole('senior_recruiter'), (req, res) => {
  const { title, body, url } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'title is required' });

  const existing = db.prepare('SELECT id, type FROM pokedex_entries WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  if (existing.type === 'link' && !url?.trim()) return res.status(400).json({ error: 'url is required for link entries' });

  db.prepare(`
    UPDATE pokedex_entries SET title=?, body=?, url=?, updated_at=datetime('now') WHERE id=?
  `).run(title.trim(), body || null, url?.trim() || null, req.params.id);

  res.json({ success: true });
});

// DELETE /api/pokedex/entries/:id — senior_recruiter+
router.delete('/entries/:id', requireAuth, requireRole('senior_recruiter'), (req, res) => {
  const result = db.prepare('DELETE FROM pokedex_entries WHERE id=?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

module.exports = router;
