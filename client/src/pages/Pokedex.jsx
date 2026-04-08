import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

const ROLE_RANK = { recruiter: 1, senior_recruiter: 2, admin: 3 };
const EMPTY_ENTRY = { type: 'link', title: '', body: '', url: '' };
const EMPTY_CAT   = { name: '' };

/* ── Link card ─────────────────────────────────────────────────── */
function LinkCard({ entry, canEdit, onEdit, onDelete }) {
  let domain = '';
  try { domain = new URL(entry.url).hostname; } catch (_) {}

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {domain && (
            <img
              src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`}
              alt=""
              className="w-4 h-4 shrink-0 mt-0.5"
              onError={e => { e.target.style.display = 'none'; }}
            />
          )}
          <p className="text-sm font-semibold text-slate-800 leading-tight truncate">{entry.title}</p>
        </div>
        <a
          href={entry.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="shrink-0 px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 font-medium"
        >
          Open ↗
        </a>
      </div>
      {entry.body && <p className="text-xs text-slate-500 leading-relaxed">{entry.body}</p>}
      {domain && <p className="text-xs text-slate-300">{domain}</p>}
      {canEdit && (
        <div className="flex gap-1.5 mt-auto pt-1 border-t border-slate-100">
          <button onClick={() => onEdit(entry)} className="px-2 py-0.5 text-xs bg-slate-100 text-slate-600 rounded hover:bg-slate-200">Edit</button>
          <button onClick={() => onDelete(entry.id)} className="px-2 py-0.5 text-xs bg-red-50 text-red-500 rounded hover:bg-red-100">Delete</button>
        </div>
      )}
    </div>
  );
}

/* ── Note card ─────────────────────────────────────────────────── */
function NoteCard({ entry, canEdit, onEdit, onDelete }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col gap-2">
      <p className="text-sm font-semibold text-slate-800">{entry.title}</p>
      {entry.body && (
        <pre className="text-xs text-slate-600 whitespace-pre-wrap font-sans leading-relaxed">{entry.body}</pre>
      )}
      {canEdit && (
        <div className="flex gap-1.5 mt-auto pt-1 border-t border-slate-100">
          <button onClick={() => onEdit(entry)} className="px-2 py-0.5 text-xs bg-slate-100 text-slate-600 rounded hover:bg-slate-200">Edit</button>
          <button onClick={() => onDelete(entry.id)} className="px-2 py-0.5 text-xs bg-red-50 text-red-500 rounded hover:bg-red-100">Delete</button>
        </div>
      )}
    </div>
  );
}

/* ── Entry form ────────────────────────────────────────────────── */
function EntryForm({ categoryId, onSave, onCancel, initial }) {
  const [form, setForm] = useState(initial || EMPTY_ENTRY);
  const set = (f) => (e) => setForm(prev => ({ ...prev, [f]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    onSave({ ...form, category_id: categoryId });
  };

  return (
    <form onSubmit={handleSubmit} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
      <div className="flex gap-2">
        <select
          value={form.type}
          onChange={set('type')}
          className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={!!initial}
        >
          <option value="link">🔗 Link</option>
          <option value="note">📝 Note</option>
        </select>
        <input
          autoFocus
          required
          value={form.title}
          onChange={set('title')}
          placeholder="Title *"
          className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      {form.type === 'link' && (
        <input
          value={form.url}
          onChange={set('url')}
          placeholder="URL"
          className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      )}
      <textarea
        rows={3}
        value={form.body}
        onChange={set('body')}
        placeholder={form.type === 'link' ? 'Description (optional)' : 'Content'}
        className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <div className="flex gap-2">
        <button type="submit" className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700">
          {initial ? 'Save' : 'Add'}
        </button>
        <button type="button" onClick={onCancel} className="px-3 py-1.5 bg-slate-100 text-slate-600 text-xs rounded-lg hover:bg-slate-200">
          Cancel
        </button>
      </div>
    </form>
  );
}

/* ── Category section ──────────────────────────────────────────── */
function CategorySection({ category, canEdit, onDeleteCategory, onEditCategory, onAddEntry, onEditEntry, onDeleteEntry }) {
  const [collapsed, setCollapsed] = useState(false);
  const [addingType, setAddingType] = useState(null); // 'link' | 'note' | null
  const [editingEntry, setEditingEntry] = useState(null);
  const [editingCat, setEditingCat] = useState(false);
  const [editCatName, setEditCatName] = useState(category.name);

  const handleSaveCat = (e) => {
    e.preventDefault();
    if (!editCatName.trim()) return;
    onEditCategory(category.id, { name: editCatName.trim(), order_index: category.order_index });
    setEditingCat(false);
  };

  const handleSaveEntry = async (data) => {
    if (editingEntry) {
      await onEditEntry(editingEntry.id, data);
      setEditingEntry(null);
    } else {
      await onAddEntry({ ...data, category_id: category.id });
      setAddingType(null);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Category header */}
      <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-100">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => setCollapsed(c => !c)}
            className="text-slate-400 hover:text-slate-600 text-sm font-bold transition-transform"
            style={{ transform: collapsed ? 'rotate(-90deg)' : undefined }}
          >
            ▼
          </button>
          {editingCat ? (
            <form onSubmit={handleSaveCat} className="flex gap-2 items-center">
              <input
                autoFocus
                value={editCatName}
                onChange={e => setEditCatName(e.target.value)}
                className="border border-slate-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button type="submit" className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700">Save</button>
              <button type="button" onClick={() => { setEditingCat(false); setEditCatName(category.name); }} className="px-2 py-1 bg-slate-100 text-xs rounded hover:bg-slate-200">Cancel</button>
            </form>
          ) : (
            <h3 className="text-sm font-bold text-slate-800 truncate">{category.name}</h3>
          )}
          <span className="shrink-0 px-2 py-0.5 bg-slate-200 text-slate-500 text-xs rounded-full font-medium">
            {category.entries.length}
          </span>
        </div>
        {canEdit && !editingCat && (
          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            <button
              onClick={() => { setAddingType('link'); setCollapsed(false); }}
              className="px-2.5 py-1 text-xs bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 font-medium"
            >
              + Link
            </button>
            <button
              onClick={() => { setAddingType('note'); setCollapsed(false); }}
              className="px-2.5 py-1 text-xs bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200"
            >
              + Note
            </button>
            <button
              onClick={() => setEditingCat(true)}
              className="px-2.5 py-1 text-xs bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200"
            >
              Rename
            </button>
            <button
              onClick={() => onDeleteCategory(category.id)}
              className="px-2.5 py-1 text-xs bg-red-50 text-red-500 rounded-lg hover:bg-red-100"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {!collapsed && (
        <div className="p-4">
          {addingType && (
            <div className="mb-4">
              <EntryForm
                categoryId={category.id}
                initial={{ ...EMPTY_ENTRY, type: addingType }}
                onSave={handleSaveEntry}
                onCancel={() => setAddingType(null)}
              />
            </div>
          )}

          {category.entries.length === 0 && !addingType ? (
            <p className="text-sm text-slate-300 italic text-center py-4">No entries yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {category.entries.map(entry => (
                editingEntry?.id === entry.id ? (
                  <div key={entry.id} className="sm:col-span-2 lg:col-span-3">
                    <EntryForm
                      categoryId={category.id}
                      initial={{ type: entry.type, title: entry.title, body: entry.body || '', url: entry.url || '' }}
                      onSave={handleSaveEntry}
                      onCancel={() => setEditingEntry(null)}
                    />
                  </div>
                ) : entry.type === 'link' ? (
                  <LinkCard
                    key={entry.id}
                    entry={entry}
                    canEdit={canEdit}
                    onEdit={setEditingEntry}
                    onDelete={onDeleteEntry}
                  />
                ) : (
                  <NoteCard
                    key={entry.id}
                    entry={entry}
                    canEdit={canEdit}
                    onEdit={setEditingEntry}
                    onDelete={onDeleteEntry}
                  />
                )
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Pokédex page ──────────────────────────────────────────────── */
export default function Pokedex() {
  const { user }     = useAuth();
  const canEdit      = ROLE_RANK[user?.role] >= ROLE_RANK.senior_recruiter;
  const [categories, setCategories] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [addingCat, setAddingCat]   = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [error, setError]           = useState('');

  const load = useCallback(async () => {
    const data = await api.getPokedex().catch(() => []);
    setCategories(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    setError('');
    const res = await api.createPokedexCategory({ name: newCatName.trim() });
    if (res.error) { setError(res.error); return; }
    setNewCatName('');
    setAddingCat(false);
    load();
  };

  const handleDeleteCategory = async (id) => {
    setError('');
    const res = await api.deletePokedexCategory(id);
    if (res.error) { setError(res.error); return; }
    load();
  };

  const handleEditCategory = async (id, data) => {
    setError('');
    const res = await api.updatePokedexCategory(id, data);
    if (res.error) { setError(res.error); return; }
    load();
  };

  const handleAddEntry = async (data) => {
    setError('');
    const res = await api.createPokedexEntry(data);
    if (res.error) { setError(res.error); return; }
    load();
  };

  const handleEditEntry = async (id, data) => {
    setError('');
    const res = await api.updatePokedexEntry(id, data);
    if (res.error) { setError(res.error); return; }
    load();
  };

  const handleDeleteEntry = async (id) => {
    setError('');
    const res = await api.deletePokedexEntry(id);
    if (res.error) { setError(res.error); return; }
    load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-slate-400 text-sm">Loading…</span>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">🔴 Pokédex</h1>
          <p className="text-slate-400 text-sm mt-0.5">Recruiting knowledge base</p>
        </div>
        {canEdit && (
          <button
            onClick={() => setAddingCat(c => !c)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              addingCat
                ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {addingCat ? 'Cancel' : '+ Add Category'}
          </button>
        )}
      </div>

      {/* Add category form */}
      {addingCat && (
        <div className="mb-6">
          <form onSubmit={handleAddCategory} className="flex gap-3 items-end bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex-1">
              <label className="block text-xs text-slate-500 mb-1">Category Name *</label>
              <input
                autoFocus
                required
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                placeholder="e.g. Sourcing"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
              Create
            </button>
          </form>
        </div>
      )}

      {error && (
        <p className="text-red-600 text-sm mb-4 bg-red-50 border border-red-100 rounded-lg px-4 py-2">{error}</p>
      )}

      {/* Categories */}
      {categories.length === 0 ? (
        <div className="py-20 text-center text-slate-400">
          <p className="text-4xl mb-3">🔴</p>
          <p className="text-sm font-medium">No categories yet.</p>
          {canEdit && <p className="text-xs mt-1">Add a category above to get started.</p>}
        </div>
      ) : (
        <div className="space-y-4">
          {categories.map(cat => (
            <CategorySection
              key={cat.id}
              category={cat}
              canEdit={canEdit}
              onDeleteCategory={handleDeleteCategory}
              onEditCategory={handleEditCategory}
              onAddEntry={handleAddEntry}
              onEditEntry={handleEditEntry}
              onDeleteEntry={handleDeleteEntry}
            />
          ))}
        </div>
      )}
    </div>
  );
}
