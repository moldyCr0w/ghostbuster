const express     = require('express');
const router      = express.Router();
const db          = require('../db');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');

// GET /api/pokedex — all categories with nested entries
router.get('/', requireAuth, (req, res) => {
  const categories = db.prepare(
    'SELECT * FROM pokedex_categories ORDER BY order_index, id'
  ).all();
  const entries = db.prepare(
    'SELECT * FROM pokedex_entries ORDER BY order_index, id'
  ).all();

  const entriesByCategory = {};
  for (const e of entries) {
    if (!entriesByCategory[e.category_id]) entriesByCategory[e.category_id] = [];
    entriesByCategory[e.category_id].push(e);
  }

  const result = categories.map(c => ({
    ...c,
    entries: entriesByCategory[c.id] || [],
  }));
  res.json(result);
});

// POST /api/pokedex/categories
router.post('/categories', requireAuth, requireRole('senior_recruiter'), (req, res) => {
  const { name, order_index } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    const maxOrd = db.prepare('SELECT MAX(order_index) as m FROM pokedex_categories').get().m || 0;
    const r = db.prepare(
      'INSERT INTO pokedex_categories (name, order_index) VALUES (?, ?)'
    ).run(name, order_index ?? maxOrd + 1);
    res.status(201).json({ id: r.lastInsertRowid });
  } catch (err) {
    if (err.message?.includes('UNIQUE')) {
      return res.status(409).json({ error: 'A category with that name already exists' });
    }
    throw err;
  }
});

// PUT /api/pokedex/categories/:id
router.put('/categories/:id', requireAuth, requireRole('senior_recruiter'), (req, res) => {
  const { name, order_index } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    const result = db.prepare(
      'UPDATE pokedex_categories SET name=?, order_index=? WHERE id=?'
    ).run(name, order_index ?? 0, req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Category not found' });
    res.json({ success: true });
  } catch (err) {
    if (err.message?.includes('UNIQUE')) {
      return res.status(409).json({ error: 'A category with that name already exists' });
    }
    throw err;
  }
});

// DELETE /api/pokedex/categories/:id
router.delete('/categories/:id', requireAuth, requireRole('senior_recruiter'), (req, res) => {
  const result = db.prepare('DELETE FROM pokedex_categories WHERE id=?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Category not found' });
  res.json({ success: true });
});

// POST /api/pokedex/entries
router.post('/entries', requireAuth, requireRole('senior_recruiter'), (req, res) => {
  const { category_id, type, title, body, url, order_index } = req.body;
  if (!category_id || !type || !title) {
    return res.status(400).json({ error: 'category_id, type, and title are required' });
  }
  if (!['link', 'note'].includes(type)) {
    return res.status(400).json({ error: 'type must be "link" or "note"' });
  }
  const maxOrd = db.prepare(
    'SELECT MAX(order_index) as m FROM pokedex_entries WHERE category_id=?'
  ).get(category_id).m || 0;
  const r = db.prepare(`
    INSERT INTO pokedex_entries (category_id, type, title, body, url, order_index, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(category_id, type, title, body || null, url || null, order_index ?? maxOrd + 1, req.user?.id || null);
  res.status(201).json({ id: r.lastInsertRowid });
});

// PUT /api/pokedex/entries/:id
router.put('/entries/:id', requireAuth, requireRole('senior_recruiter'), (req, res) => {
  const { title, body, url, order_index } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });
  const result = db.prepare(`
    UPDATE pokedex_entries
    SET title=?, body=?, url=?, order_index=?, updated_at=datetime('now')
    WHERE id=?
  `).run(title, body || null, url || null, order_index ?? 0, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Entry not found' });
  res.json({ success: true });
});

// DELETE /api/pokedex/entries/:id
router.delete('/entries/:id', requireAuth, requireRole('senior_recruiter'), (req, res) => {
  const result = db.prepare('DELETE FROM pokedex_entries WHERE id=?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Entry not found' });
  res.json({ success: true });
});

module.exports = router;
