'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { apiFetch } from '@/lib/api-client';

interface Post {
  _id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  coverImage?: string;
  category: string;
  tags: string[];
  seoTitle?: string;
  seoDescription?: string;
  published: boolean;
}

const EMPTY_FORM = {
  title: '',
  excerpt: '',
  content: '',
  coverImage: '',
  category: '',
  tags: '',
  seoTitle: '',
  seoDescription: '',
};

export default function AdminBlogPage() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ posts: Post[] }>('/api/v1/admin/blog');
      setPosts(data.posts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function startEdit(post: Post) {
    setEditingId(post._id);
    setForm({
      title: post.title,
      excerpt: post.excerpt,
      content: post.content,
      coverImage: post.coverImage ?? '',
      category: post.category,
      tags: post.tags.join(', '),
      seoTitle: post.seoTitle ?? '',
      seoDescription: post.seoDescription ?? '',
    });
    setShowForm(true);
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
  }

  async function handleSubmit(e: React.FormEvent, publish?: boolean) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    const payload = {
      title: form.title,
      excerpt: form.excerpt,
      content: form.content,
      coverImage: form.coverImage || undefined,
      category: form.category,
      tags: form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      seoTitle: form.seoTitle || undefined,
      seoDescription: form.seoDescription || undefined,
      ...(publish !== undefined ? { published: publish } : {}),
    };
    try {
      if (editingId) {
        await apiFetch(`/api/v1/admin/blog/${editingId}`, { method: 'PATCH', json: payload });
      } else {
        await apiFetch('/api/v1/admin/blog', { method: 'POST', json: payload });
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSubmitting(false);
    }
  }

  async function togglePublish(post: Post) {
    setBusyId(post._id);
    try {
      await apiFetch(`/api/v1/admin/blog/${post._id}`, {
        method: 'PATCH',
        json: { published: !post.published },
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    try {
      await apiFetch(`/api/v1/admin/blog/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AdminShell
      title="Blog"
      action={
        <button
          onClick={() => (showForm ? resetForm() : setShowForm(true))}
          className="rounded-full bg-gold px-4 py-2 text-sm font-semibold text-navy-deep hover:bg-gold-soft"
        >
          {showForm ? 'Annuler' : '+ Nouvel article'}
        </button>
      }
    >
      {showForm && (
        <form className="mb-6 space-y-3 rounded-ticket border border-white/10 bg-navy-mid p-5">
          <input
            required
            placeholder="Titre"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className="w-full rounded-lg border border-white/10 bg-navy-deep px-3 py-2 text-sm text-bone outline-none focus:border-gold"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              required
              placeholder="Catégorie (ex: eFootball, Sécurité)"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              className="rounded-lg border border-white/10 bg-navy-deep px-3 py-2 text-sm text-bone outline-none focus:border-gold"
            />
            <input
              placeholder="Tags (séparés par des virgules)"
              value={form.tags}
              onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
              className="rounded-lg border border-white/10 bg-navy-deep px-3 py-2 text-sm text-bone outline-none focus:border-gold"
            />
          </div>
          <input
            placeholder="URL image de couverture (optionnel)"
            value={form.coverImage}
            onChange={(e) => setForm((f) => ({ ...f, coverImage: e.target.value }))}
            className="w-full rounded-lg border border-white/10 bg-navy-deep px-3 py-2 text-sm text-bone outline-none focus:border-gold"
          />
          <textarea
            required
            rows={2}
            placeholder="Résumé (affiché dans la liste, 300 caractères max)"
            maxLength={300}
            value={form.excerpt}
            onChange={(e) => setForm((f) => ({ ...f, excerpt: e.target.value }))}
            className="w-full rounded-lg border border-white/10 bg-navy-deep px-3 py-2 text-sm text-bone outline-none focus:border-gold"
          />
          <textarea
            required
            rows={10}
            placeholder="Contenu (HTML autorisé : <h2>, <p>, <ul><li>, <strong>, <a>...)"
            value={form.content}
            onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
            className="w-full rounded-lg border border-white/10 bg-navy-deep px-3 py-2 font-mono text-xs text-bone outline-none focus:border-gold"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              placeholder="Titre SEO (optionnel, sinon = titre)"
              maxLength={70}
              value={form.seoTitle}
              onChange={(e) => setForm((f) => ({ ...f, seoTitle: e.target.value }))}
              className="rounded-lg border border-white/10 bg-navy-deep px-3 py-2 text-sm text-bone outline-none focus:border-gold"
            />
            <input
              placeholder="Description SEO (optionnel)"
              maxLength={160}
              value={form.seoDescription}
              onChange={(e) => setForm((f) => ({ ...f, seoDescription: e.target.value }))}
              className="rounded-lg border border-white/10 bg-navy-deep px-3 py-2 text-sm text-bone outline-none focus:border-gold"
            />
          </div>
          {error && <p className="text-sm text-coral">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={(e) => handleSubmit(e, false)}
              className="rounded-full border border-white/15 px-4 py-2 text-sm text-bone/80 hover:border-white/30 disabled:opacity-60"
            >
              Enregistrer en brouillon
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={(e) => handleSubmit(e, true)}
              className="rounded-full bg-gold px-4 py-2 text-sm font-semibold text-navy-deep hover:bg-gold-soft disabled:opacity-60"
            >
              {submitting ? 'Envoi…' : 'Publier'}
            </button>
          </div>
        </form>
      )}

      {!showForm && error && <p className="mb-4 text-sm text-coral">{error}</p>}

      {!posts ? (
        <p className="text-sm text-bone/50">Chargement…</p>
      ) : posts.length === 0 ? (
        <p className="text-sm text-bone/50">Aucun article pour l&apos;instant.</p>
      ) : (
        <div className="overflow-hidden rounded-ticket border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-navy-mid text-left text-xs uppercase tracking-wide text-bone/50">
              <tr>
                <th className="px-4 py-3">Titre</th>
                <th className="px-4 py-3">Catégorie</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((post) => (
                <tr key={post._id} className="border-t border-white/5">
                  <td className="px-4 py-3">{post.title}</td>
                  <td className="px-4 py-3 text-bone/60">{post.category}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs ${
                        post.published ? 'bg-mint/15 text-mint' : 'bg-white/10 text-bone/50'
                      }`}
                    >
                      {post.published ? 'Publié' : 'Brouillon'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => startEdit(post)}
                        className="rounded-full border border-white/15 px-3 py-1 text-xs text-bone/70 hover:border-white/30"
                      >
                        Modifier
                      </button>
                      <button
                        disabled={busyId === post._id}
                        onClick={() => togglePublish(post)}
                        className="rounded-full bg-gold/15 px-3 py-1 text-xs text-gold hover:bg-gold/25 disabled:opacity-50"
                      >
                        {post.published ? 'Dépublier' : 'Publier'}
                      </button>
                      <button
                        disabled={busyId === post._id}
                        onClick={() => handleDelete(post._id)}
                        className="rounded-full bg-coral/15 px-3 py-1 text-xs text-coral hover:bg-coral/25 disabled:opacity-50"
                      >
                        Supprimer
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}
