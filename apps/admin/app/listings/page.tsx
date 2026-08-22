'use client';

import { useEffect, useState, useCallback } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { apiFetch } from '@/lib/api-client';

interface Listing {
  _id: string;
  title: string;
  price: number;
  currency: string;
  country: string;
  seller: string;
  createdAt: string;
}

export default function AdminListingsPage() {
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ listings: Listing[] }>('/api/v1/admin/listings/pending');
      setListings(data.listings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function approve(id: string) {
    setBusyId(id);
    try {
      await apiFetch(`/api/v1/admin/listings/${id}/approve`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setBusyId(null);
    }
  }

  async function reject(id: string) {
    setBusyId(id);
    try {
      await apiFetch(`/api/v1/admin/listings/${id}/reject`, { method: 'POST', json: { notes } });
      setRejecting(null);
      setNotes('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AdminShell title="Annonces en attente de modération">
      {error && <p className="mb-4 text-sm text-coral">{error}</p>}
      {!listings ? (
        <p className="text-sm text-bone/50">Chargement…</p>
      ) : listings.length === 0 ? (
        <p className="text-sm text-bone/50">Aucune annonce en attente.</p>
      ) : (
        <div className="space-y-3">
          {listings.map((l) => (
            <div
              key={l._id}
              className="rounded-ticket border border-white/10 bg-navy-mid p-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-display text-base text-bone">{l.title}</p>
                  <p className="mt-1 font-mono text-sm text-gold">
                    {l.price.toLocaleString('fr-FR')} {l.currency}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    disabled={busyId === l._id}
                    onClick={() => approve(l._id)}
                    className="rounded-full bg-mint/15 px-3 py-1.5 text-xs text-mint hover:bg-mint/25 disabled:opacity-50"
                  >
                    Approuver
                  </button>
                  <button
                    disabled={busyId === l._id}
                    onClick={() => setRejecting(rejecting === l._id ? null : l._id)}
                    className="rounded-full bg-coral/15 px-3 py-1.5 text-xs text-coral hover:bg-coral/25 disabled:opacity-50"
                  >
                    Rejeter
                  </button>
                </div>
              </div>
              {rejecting === l._id && (
                <div className="mt-3 flex gap-2">
                  <input
                    placeholder="Raison du rejet (optionnel)"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="flex-1 rounded-lg border border-white/10 bg-navy-deep px-3 py-1.5 text-xs text-bone outline-none focus:border-gold"
                  />
                  <button
                    onClick={() => reject(l._id)}
                    className="rounded-full bg-coral/15 px-3 py-1.5 text-xs text-coral hover:bg-coral/25"
                  >
                    Confirmer le rejet
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
