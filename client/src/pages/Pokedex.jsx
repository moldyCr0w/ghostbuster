import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

/* ── Link Card ─────────────────────────────────────────────────── */
function LinkCard({ entry, canEdit, onEdit, onDelete }) {
  let domain = '';
  try { domain = new URL(entry.url).hostname.replace('www.', ''); } catch (_) {}

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-2 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-800 text-sm leading-snug">{entry.title}</p>
          {domain && <p className="text-xs text-slate-400 mt-0.5">{domain}</p>}
        </div>
        <a
          href={entry.url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 px-2.5 py-1 bg-blue-50 text-blue-600 text-xs font-semibold rounded-lg hover:bg-blue-100 transition-colors"
        >
          Open ↗
        </a>
      </div>
      {entry.body && (
        <p className="text-xs text-slate-500 leading-relaxed line-clamp-3">{entry.body}</p>
      )}
      {canEdit && (
        <div className="flex gap-2 pt-1 border-t border-slate-100 mt-auto">
          <button onClick={() => onEdit(entry)} className="text-xs text-slate-400 hover:text-blue-600 transition-colors">Edit</button>
          <button onClick={() => onDelete(entry.id)} className="text-xs text-slate-400 hover:text-red-500 transition-colors">Delete</button>
        </div>
      )}
    </div>
  );
}

/* ── Note Card ─────────────────────────────────────────────────── */
function NoteCard({ entry, canEdit, onEdit, onDelete }) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col gap-2 shadow-sm hover:shadow-md transition-shadow">
      <p className="font-semibold text-amber-900 text-sm leading-snug">{entry.title}</p>
      {entry.body && (
        <pre className="text-xs text-amber-800 whitespace-pre-wrap font-sans leading-relaxed flex-1">{entry.body}</pre>
      )}
      {canEdit && (
        <div className="flex gap-2 pt-1 border-t border-amber-200 mt-auto">
          <button onClick={() => onEdit(entry)} className="text-xs text-amber-600 hover:text-blue-600 transition-colors">Edit</button>
          <button onClick={() => onDelete(entry.id)} className="text-xs text-amber-600 hover:text-red-500 transition-colors">Delete</button>
        </div>
      )}
    </div>
  );
}

/* ── Add/Edit Entry Form ────────────────────────────────────────── */
function EntryForm({ categoryId, entry, onSave, onCancel }) {
  const isEditing = !!entry;
  const [type, setType]   = useState(entry?.type || 'link');
  const [title, setTitle] = useState(entry?.title || '');
  const [body, setBody]   = useState(entry?.body || '');
  const [url, setUrl]     = useState(entry?.url || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!title.trim()) { setError('Title is required'); return; }
    if (type === 'link' && !url.trim()) { setError('URL is required for links'); return; }
    setSaving(true);
    try {
      if (isEditing) {
        await api.updatePokedexEntry(entry.id, { title, body, url: type === 'link' ? url : undefined });
      } else {
        await api.createPokedexEntry({ category_id: categoryId, type, title, body, url: type === 'link' ? url : undefined });
      }
      onSave();
    } catch (_) {
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
      {!isEditing && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setType('link')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
              type === 'link'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
            }`}
          >
            🔗 Link
          </button>
          <button
            type="button"
            onClick={() => setType('note')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
              type === 'note'
                ? 'bg-amber-500 text-white border-amber-500'
                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
            }`}
          >
            📝 Note
          </button>
        </div>
      )}
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Title"
        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {(isEditing ? entry.type === 'link' : type === 'link') && (
        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://..."
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      )}
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        placeholder="Description or notes (optional)"
        rows={3}
        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Add Entry'}
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors">
          Cancel
        </button>
      </div>
    </form>
  );
}

/* ── Category section ───────────────────────────────────────────── */
function CategorySection({ category, canEdit, onRefresh }) {
  const [collapsed, setCollapsed] = useState(false);
  const [addingType, setAddingType] = useState(null); // 'entry' = show form
  const [editingEntry, setEditingEntry] = useState(null);
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(category.name);
  const [nameError, setNameError] = useState('');

  const handleDeleteCategory = async () => {
    if (!window.confirm(`Delete category "${category.name}" and all its entries?`)) return;
    await api.deletePokedexCategory(category.id);
    onRefresh();
  };

  const handleSaveName = async (e) => {
    e.preventDefault();
    setNameError('');
    if (!nameVal.trim()) { setNameError('Name is required'); return; }
    const res = await api.updatePokedexCategory(category.id, { name: nameVal.trim() });
    if (res.error) { setNameError(res.error); return; }
    setEditingName(false);
    onRefresh();
  };

  const handleDeleteEntry = async (entryId) => {
    if (!window.confirm('Delete this entry?')) return;
    await api.deletePokedexEntry(entryId);
    onRefresh();
  };

  const handleEntrySave = () => {
    setAddingType(null);
    setEditingEntry(null);
    onRefresh();
  };

  return (
    <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
      {/* Category header */}
      <div className="flex items-center gap-3 px-5 py-3 bg-slate-50 border-b border-slate-200">
        <button
          onClick={() => setCollapsed(c => !c)}
          className="text-slate-400 hover:text-slate-600 transition-colors text-sm leading-none"
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '▶' : '▼'}
        </button>

        {editingName ? (
          <form onSubmit={handleSaveName} className="flex items-center gap-2 flex-1">
            <input
              value={nameVal}
              onChange={e => setNameVal(e.target.value)}
              autoFocus
              className="text-sm font-bold text-slate-800 border border-slate-300 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {nameError && <span className="text-xs text-red-500">{nameError}</span>}
            <button type="submit" className="text-xs text-blue-600 hover:text-blue-800 font-medium">Save</button>
            <button type="button" onClick={() => { setEditingName(false); setNameVal(category.name); }} className="text-xs text-slate-400">Cancel</button>
          </form>
        ) : (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="font-bold text-slate-800 text-sm">{category.name}</span>
            <span className="text-xs text-slate-400 shrink-0">
              {category.entries.length} {category.entries.length === 1 ? 'entry' : 'entries'}
            </span>
          </div>
        )}

        {canEdit && !editingName && (
          <div className="flex items-center gap-3 shrink-0">
            <button onClick={() => setAddingType('entry')} className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors">
              + Add Entry
            </button>
            <button onClick={() => setEditingName(true)} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
              Rename
            </button>
            <button onClick={handleDeleteCategory} className="text-xs text-slate-400 hover:text-red-500 transition-colors">
              Delete
            </button>
          </div>
        )}
      </div>

      {!collapsed && (
        <div className="p-4 space-y-4">
          {/* Entry grid */}
          {category.entries.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {category.entries.map(entry => (
                entry.type === 'link'
                  ? <LinkCard key={entry.id} entry={entry} canEdit={canEdit} onEdit={setEditingEntry} onDelete={handleDeleteEntry} />
                  : <NoteCard key={entry.id} entry={entry} canEdit={canEdit} onEdit={setEditingEntry} onDelete={handleDeleteEntry} />
              ))}
            </div>
          ) : (
            !addingType && !editingEntry && (
              <p className="text-sm text-slate-400 italic text-center py-4">No entries yet.{canEdit ? ' Add one above.' : ''}</p>
            )
          )}

          {/* Edit entry form */}
          {editingEntry && (
            <EntryForm
              categoryId={category.id}
              entry={editingEntry}
              onSave={handleEntrySave}
              onCancel={() => setEditingEntry(null)}
            />
          )}

          {/* Add entry form */}
          {addingType && !editingEntry && (
            <EntryForm
              categoryId={category.id}
              onSave={handleEntrySave}
              onCancel={() => setAddingType(null)}
            />
          )}
        </div>
      )}
    </div>
  );
}

/* ── Main Pokédex page ──────────────────────────────────────────── */
export default function Pokedex() {
  const { user: me }             = useAuth();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [addingCat, setAddingCat]   = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [catError, setCatError]     = useState('');

  const canEdit = me?.role === 'senior_recruiter' || me?.role === 'admin';

  const load = useCallback(async () => {
    const data = await api.getPokedex();
    setCategories(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAddCategory = async (e) => {
    e.preventDefault();
    setCatError('');
    if (!newCatName.trim()) { setCatError('Name is required'); return; }
    const res = await api.createPokedexCategory({ name: newCatName.trim() });
    if (res.error) { setCatError(res.error); return; }
    setNewCatName('');
    setAddingCat(false);
    load();
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Loading…</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <span>🔴</span> Pokédex
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Recruiting knowledge base</p>
        </div>
        {canEdit && (
          <button
            onClick={() => setAddingCat(c => !c)}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors shrink-0"
          >
            + Add Category
          </button>
        )}
      </div>

      {/* Add category form */}
      {addingCat && (
        <form onSubmit={handleAddCategory} className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
          <input
            value={newCatName}
            onChange={e => setNewCatName(e.target.value)}
            placeholder="Category name"
            autoFocus
            className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {catError && <span className="text-xs text-red-500">{catError}</span>}
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Create
          </button>
          <button
            type="button"
            onClick={() => { setAddingCat(false); setNewCatName(''); setCatError(''); }}
            className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
          >
            Cancel
          </button>
        </form>
      )}

      {/* Category sections */}
      {categories.length === 0 ? (
        <div className="text-center py-16 bg-white border border-slate-200 rounded-2xl">
          <p className="text-4xl mb-3">🔴</p>
          <p className="text-slate-600 font-medium">No categories yet.</p>
          {canEdit && (
            <p className="text-sm text-slate-400 mt-1">Click "+ Add Category" to get started.</p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {categories.map(cat => (
            <CategorySection
              key={cat.id}
              category={cat}
              canEdit={canEdit}
              onRefresh={load}
            />
          ))}
        </div>
      )}
    </div>
  );
}
