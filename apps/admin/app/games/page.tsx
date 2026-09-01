'use client';

import { useEffect, useState, useCallback } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { apiFetch } from '@/lib/api-client';

interface Game {
  _id: string;
  name: string;
  slug: string;
  active: boolean;
  marketplaceEnabled: boolean;
  termsStatus: string;
  termsNotes?: string;
  listingsCount?: number;
}

const TERMS_STATUS_OPTIONS = ['UNREVIEWED', 'ALLOWED', 'RESTRICTED', 'DISABLED'];

function TermsBadge({ status }: { status: string }) {
  const color =
    status === 'ALLOWED'
      ? 'bg-mint/15 text-mint'
      : status === 'RESTRICTED' || status === 'DISABLED'
        ? 'bg-coral/15 text-coral'
        : 'bg-gold/15 text-gold';
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${color}`}>{status}</span>;
}

export default function AdminGamesPage() {
  const [games, setGames] = useState<Game[] | null>(null);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', slug: '' });
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ games: Game[] }>('/api/v1/admin/games');
      setGames(data.games);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await apiFetch('/api/v1/admin/games', { method: 'POST', json: form });
      setForm({ name: '', slug: '' });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de création');
    } finally {
      setSubmitting(false);
    }
  }

  async function update(id: string, patch: Partial<Game>) {
    setBusyId(id);
    setError('');
    try {
      await apiFetch(`/api/v1/admin/games/${id}`, { method: 'PATCH', json: patch });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(game: Game) {
    if (!window.confirm(`Supprimer définitivement le jeu « ${game.name} » ?`)) {
      return;
    }
    setBusyId(game._id);
    setError('');
    try {
      await apiFetch(`/api/v1/admin/games/${game._id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AdminShell
      title="Jeux"
      action={
        <button
          onClick={() => setShowForm((s) => !s)}
          className="rounded-full bg-gold px-4 py-2 text-sm font-semibold text-navy-deep hover:bg-gold-soft"
        >
          {showForm ? 'Annuler' : '+ Nouveau jeu'}
        </button>
      }
    >
      <p className="mb-4 text-xs text-bone/40">
        §3 — Kill-switch commercial. Un jeu créé est toujours désactivé
        commercialement par défaut (<code>marketplaceEnabled: false</code>). Ne l&apos;activer
        qu&apos;après revue explicite des CGU de l&apos;éditeur.
      </p>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="mb-6 grid gap-3 rounded-ticket border border-white/10 bg-navy-mid p-5 sm:grid-cols-3"
        >
          <input
            required
            placeholder="Nom (ex: eFootball)"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="rounded-lg border border-white/10 bg-navy-deep px-3 py-2 text-sm text-bone outline-none focus:border-gold"
          />
          <input
            required
            placeholder="slug (ex: efootball)"
            value={form.slug}
            onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase() }))}
            className="rounded-lg border border-white/10 bg-navy-deep px-3 py-2 text-sm text-bone outline-none focus:border-gold"
          />
          <button
            type="submit"
            disabled={submitting}
            className="rounded-full bg-gold px-4 py-2 text-sm font-semibold text-navy-deep hover:bg-gold-soft disabled:opacity-60"
          >
            {submitting ? 'Création…' : 'Créer'}
          </button>
        </form>
      )}

      {error && <p className="mb-4 text-sm text-coral">{error}</p>}

      {!games ? (
        <p className="text-sm text-bone/50">Chargement…</p>
      ) : (
        <div className="overflow-hidden rounded-ticket border border-white/10">
          <table className="text-sm">
            <thead className="bg-navy-mid text-left text-xs uppercase tracking-wide text-bone/50">
              <tr>
                <th className="px-4 py-3">Jeu</th>
                <th className="px-4 py-3">Actif</th>
                <th className="px-4 py-3">Vente activée</th>
                <th className="px-4 py-3">Statut CGU</th>
                <th className="px-4 py-3">Notes</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {games.map((g) => (
                <tr key={g._id} className="border-t border-white/5">
                  <td className="px-4 py-3">
                    <p>{g.name}</p>
                    <p className="font-mono text-xs text-bone/40">{g.slug}</p>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      disabled={busyId === g._id}
                      onClick={() => update(g._id, { active: !g.active })}
                      className={`rounded-full px-3 py-1 text-xs disabled:opacity-50 ${
                        g.active ? 'bg-mint/15 text-mint' : 'bg-white/10 text-bone/50'
                      }`}
                    >
                      {g.active ? 'Actif' : 'Inactif'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      disabled={busyId === g._id}
                      onClick={() => update(g._id, { marketplaceEnabled: !g.marketplaceEnabled })}
                      className={`rounded-full px-3 py-1 text-xs disabled:opacity-50 ${
                        g.marketplaceEnabled ? 'bg-mint/15 text-mint' : 'bg-coral/15 text-coral'
                      }`}
                    >
                      {g.marketplaceEnabled ? 'Activée' : 'Désactivée'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={g.termsStatus}
                      disabled={busyId === g._id}
                      onChange={(e) => update(g._id, { termsStatus: e.target.value as Game['termsStatus'] })}
                      className="rounded-lg border border-white/10 bg-navy-deep px-2 py-1 text-xs text-bone outline-none focus:border-gold"
                    >
                      {TERMS_STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <div className="mt-1">
                      <TermsBadge status={g.termsStatus} />
                    </div>
                  </td>
                  <td className="px-4 py-3 max-w-xs text-xs text-bone/50">{g.termsNotes ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        disabled={busyId === g._id}
                        onClick={() => remove(g)}
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
