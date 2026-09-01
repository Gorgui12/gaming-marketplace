'use client';

import { useEffect, useState, useCallback } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { apiFetch } from '@/lib/api-client';
import { Pagination, StatusBadge } from '@/components/admin-ui';

interface SellerRef {
  username?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
}
interface GameRef {
  title?: string;
  slug?: string;
}
interface Listing {
  _id: string;
  title: string;
  slug: string;
  price: number;
  currency: string;
  country: string;
  status: string;
  moderationStatus: string;
  moderationNotes?: string;
  views: number;
  createdAt: string;
  seller: SellerRef | null;
  game: GameRef | null;
}

const STATUS_OPTIONS = [
  'PENDING_REVIEW',
  'PUBLISHED',
  'RESERVED',
  'SOLD',
  'SUSPENDED',
  'REJECTED',
  'DRAFT',
  'ARCHIVED',
] as const;

const dateFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' });

export default function AdminListingsPage() {
  const [data, setData] = useState<{
    listings: Listing[];
    page: number;
    totalPages: number;
    total: number;
  } | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      const res = await apiFetch<{
        listings: Listing[];
        page: number;
        totalPages: number;
        total: number;
      }>(`/api/v1/admin/listings?${params.toString()}`);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    }
  }, [page, search, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function run(
    action: (id: string) => Promise<unknown>,
    id: string,
    confirmMsg?: string,
  ) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusyId(id);
    setError('');
    try {
      await action(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setBusyId(null);
    }
  }

  function reject(id: string) {
    run(async (l) => {
      await apiFetch(`/api/v1/admin/listings/${l}/reject`, {
        method: 'POST',
        json: { notes: notes.trim() || undefined },
      });
      setRejectingId(null);
      setNotes('');
    }, id);
  }

  function sellerLabel(l: Listing): string {
    const s = l.seller;
    if (!s) return '—';
    return s.username || s.email || [s.firstName, s.lastName].filter(Boolean).join(' ') || '—';
  }

  return (
    <AdminShell title="Annonces">
      <div className="mb-4 flex flex-wrap gap-2">
        <input
          placeholder="Rechercher par titre…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="w-72 rounded-lg border border-white/10 bg-navy-deep px-3 py-2 text-sm text-bone outline-none focus:border-gold"
        />
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-white/10 bg-navy-deep px-3 py-2 text-sm text-bone outline-none focus:border-gold"
        >
          <option value="ALL">Tous les statuts</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {data && (
          <span className="self-center font-mono text-xs text-bone/40">{data.total} annonce(s)</span>
        )}
      </div>

      {error && <p className="mb-4 text-sm text-coral">{error}</p>}

      {!data ? (
        <p className="text-sm text-bone/50">Chargement…</p>
      ) : (
        <>
          <div className="overflow-x-auto overflow-hidden rounded-ticket border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-navy-mid text-left text-xs uppercase tracking-wide text-bone/50">
                <tr>
                  <th className="px-4 py-3">Annonce</th>
                  <th className="px-4 py-3">Jeu</th>
                  <th className="px-4 py-3">Vendeur</th>
                  <th className="px-4 py-3">Prix</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3">Vues</th>
                  <th className="px-4 py-3">Créée le</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.listings.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-bone/50">
                      Aucune annonce trouvée.
                    </td>
                  </tr>
                )}
                {data.listings.map((l) => (
                  <ListingRow
                    key={l._id}
                    listing={l}
                    busy={busyId === l._id}
                    rejecting={rejectingId === l._id}
                    notes={notes}
                    onNotesChange={setNotes}
                    onToggleReject={() => {
                      setRejectingId(rejectingId === l._id ? null : l._id);
                      setNotes(l.moderationNotes ?? '');
                    }}
                    onApprove={() => run((id) => apiFetch(`/api/v1/admin/listings/${id}/approve`, { method: 'POST' }), l._id)}
                    onReject={() => reject(l._id)}
                    onPublish={() => run((id) => apiFetch(`/api/v1/admin/listings/${id}/publish`, { method: 'POST' }), l._id)}
                    onUnpublish={() => run((id) => apiFetch(`/api/v1/admin/listings/${id}/unpublish`, { method: 'POST' }), l._id)}
                    onDelete={() =>
                      run(
                        (id) => apiFetch(`/api/v1/admin/listings/${id}`, { method: 'DELETE' }),
                        l._id,
                        'Supprimer définitivement cette annonce ?',
                      )
                    }
                    sellerLabel={sellerLabel(l)}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
        </>
      )}
    </AdminShell>
  );
}

function ListingRow({
  listing: l,
  busy,
  rejecting,
  notes,
  onNotesChange,
  onToggleReject,
  onApprove,
  onReject,
  onPublish,
  onUnpublish,
  onDelete,
  sellerLabel,
}: {
  listing: Listing;
  busy: boolean;
  rejecting: boolean;
  notes: string;
  onNotesChange: (v: string) => void;
  onToggleReject: () => void;
  onApprove: () => void;
  onReject: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  onDelete: () => void;
  sellerLabel: string;
}) {
  const canModerate = l.status === 'PENDING_REVIEW';
  const canUnpublish = l.status === 'PUBLISHED' || l.status === 'RESERVED';
  const canPublish =
    l.status === 'REJECTED' || l.status === 'SUSPENDED' || l.status === 'DRAFT' || l.status === 'ARCHIVED';

  return (
    <>
      <tr className="border-t border-white/5">
        <td className="px-4 py-3">
          <p className="text-bone">{l.title}</p>
          <p className="font-mono text-xs text-bone/30">/{l.slug}</p>
          {l.moderationNotes && l.status === 'REJECTED' && (
            <p className="mt-1 text-xs text-coral/70">Motif : {l.moderationNotes}</p>
          )}
        </td>
        <td className="px-4 py-3 text-bone/60">{l.game?.title ?? '—'}</td>
        <td className="px-4 py-3">
          <p className="text-bone/70">{sellerLabel}</p>
          <p className="font-mono text-xs text-bone/30">{l.country}</p>
        </td>
        <td className="px-4 py-3 font-mono text-sm text-gold">
          {l.price.toLocaleString('fr-FR')} {l.currency}
        </td>
        <td className="px-4 py-3">
          <StatusBadge status={l.status} />
        </td>
        <td className="px-4 py-3 font-mono text-xs text-bone/50">{l.views}</td>
        <td className="px-4 py-3 text-bone/50">{dateFmt.format(new Date(l.createdAt))}</td>
        <td className="px-4 py-3">
          <div className="flex flex-wrap gap-2">
            {canModerate && (
              <>
                <button
                  disabled={busy}
                  onClick={onApprove}
                  className="rounded-full bg-mint/15 px-3 py-1 text-xs text-mint hover:bg-mint/25 disabled:opacity-50"
                >
                  Approuver
                </button>
                <button
                  disabled={busy}
                  onClick={onToggleReject}
                  className="rounded-full bg-coral/15 px-3 py-1 text-xs text-coral hover:bg-coral/25 disabled:opacity-50"
                >
                  Rejeter
                </button>
              </>
            )}
            {canUnpublish && (
              <button
                disabled={busy}
                onClick={onUnpublish}
                className="rounded-full bg-gold/15 px-3 py-1 text-xs text-gold hover:bg-gold/25 disabled:opacity-50"
              >
                Masquer
              </button>
            )}
            {canPublish && (
              <button
                disabled={busy}
                onClick={onPublish}
                className="rounded-full bg-mint/15 px-3 py-1 text-xs text-mint hover:bg-mint/25 disabled:opacity-50"
              >
                Publier
              </button>
            )}
            <button
              disabled={busy}
              onClick={onDelete}
              className="rounded-full bg-coral/15 px-3 py-1 text-xs text-coral hover:bg-coral/25 disabled:opacity-50"
            >
              Supprimer
            </button>
          </div>
          {rejecting && (
            <div className="mt-2 flex max-w-md gap-2">
              <input
                placeholder="Raison du rejet (optionnel)"
                value={notes}
                onChange={(e) => onNotesChange(e.target.value)}
                className="flex-1 rounded-lg border border-white/10 bg-navy-deep px-3 py-1.5 text-xs text-bone outline-none focus:border-gold"
              />
              <button
                disabled={busy}
                onClick={onReject}
                className="rounded-full bg-coral/15 px-3 py-1.5 text-xs text-coral hover:bg-coral/25 disabled:opacity-50"
              >
                Confirmer
              </button>
            </div>
          )}
        </td>
      </tr>
    </>
  );
}