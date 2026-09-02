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
  description: string;
  price: number;
  currency: string;
  country: string;
  status: string;
  moderationStatus: string;
  moderationNotes?: string;
  screenshots: string[];
  playerCount?: number;
  teamStrength?: number;
  epicPlayers?: string[];
  showTimePlayers?: string[];
  featuredPlayers?: string[];
  accountMetadata?: Record<string, unknown>;
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
  const [detailListing, setDetailListing] = useState<Listing | null>(null);

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
      if (detailListing?._id === id) setDetailListing(null);
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
                    onViewDetails={() => setDetailListing(l)}
                    sellerLabel={sellerLabel(l)}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
        </>
      )}

      {detailListing && (
        <ListingDetailPanel
          listing={detailListing}
          sellerLabel={sellerLabel(detailListing)}
          onClose={() => setDetailListing(null)}
          busy={busyId === detailListing._id}
          onApprove={() => {
            run(
              (id) => apiFetch(`/api/v1/admin/listings/${id}/approve`, { method: 'POST' }),
              detailListing._id,
            );
          }}
          onReject={() => {
            setRejectingId(detailListing._id);
            setNotes(detailListing.moderationNotes ?? '');
            setDetailListing(null);
          }}
          onPublish={() => {
            run(
              (id) => apiFetch(`/api/v1/admin/listings/${id}/publish`, { method: 'POST' }),
              detailListing._id,
            );
          }}
          onUnpublish={() => {
            run(
              (id) => apiFetch(`/api/v1/admin/listings/${id}/unpublish`, { method: 'POST' }),
              detailListing._id,
            );
          }}
          onDelete={() => {
            run(
              (id) => apiFetch(`/api/v1/admin/listings/${id}`, { method: 'DELETE' }),
              detailListing._id,
              'Supprimer définitivement cette annonce ?',
            );
          }}
        />
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
  onViewDetails,
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
  onViewDetails: () => void;
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
            <button
              disabled={busy}
              onClick={onViewDetails}
              className="rounded-full border border-white/15 px-3 py-1 text-xs text-bone/70 hover:border-white/30 disabled:opacity-50"
            >
              Détails
            </button>
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
            <div className="mt-2 max-w-md space-y-2">
              <textarea
                autoFocus
                rows={2}
                placeholder="Motif du rejet (visible par le vendeur)"
                value={notes}
                onChange={(e) => onNotesChange(e.target.value)}
                className="w-full resize-none rounded-lg border border-white/10 bg-navy-deep px-3 py-2 text-xs text-bone outline-none focus:border-gold"
              />
              <div className="flex gap-2">
                <button
                  disabled={busy}
                  onClick={onReject}
                  className="rounded-full bg-coral/15 px-3 py-1.5 text-xs text-coral hover:bg-coral/25 disabled:opacity-50"
                >
                  Confirmer le rejet
                </button>
                <button
                  onClick={onToggleReject}
                  className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-bone/60 hover:border-white/30"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}
        </td>
      </tr>
    </>
  );
}

function ListingDetailPanel({
  listing: l,
  sellerLabel,
  onClose,
  busy,
  onApprove,
  onReject,
  onPublish,
  onUnpublish,
  onDelete,
}: {
  listing: Listing;
  sellerLabel: string;
  onClose: () => void;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  onDelete: () => void;
}) {
  const [activeImg, setActiveImg] = useState(0);
  const canModerate = l.status === 'PENDING_REVIEW';
  const canUnpublish = l.status === 'PUBLISHED' || l.status === 'RESERVED';
  const canPublish =
    l.status === 'REJECTED' || l.status === 'SUSPENDED' || l.status === 'DRAFT' || l.status === 'ARCHIVED';

  const metaEntries = l.accountMetadata
    ? Object.entries(l.accountMetadata).filter(([, v]) => v !== null && v !== undefined && v !== '')
    : [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-navy-deep shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-navy-deep px-6 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-lg text-bone truncate">{l.title}</h2>
            <p className="font-mono text-xs text-bone/30">/{l.slug}</p>
          </div>
          <button
            onClick={onClose}
            className="ml-4 rounded-full border border-white/15 px-3 py-1.5 text-xs text-bone/60 hover:border-white/30"
          >
            Fermer
          </button>
        </div>

        <div className="flex-1 space-y-6 px-6 py-5">
          {/* Screenshots */}
          {l.screenshots.length > 0 && (
            <div>
              <SectionTitle>Screenshots ({l.screenshots.length})</SectionTitle>
              <div className="mt-2 overflow-hidden rounded-lg border border-white/10">
                <img
                  src={l.screenshots[activeImg]}
                  alt={`Screenshot ${activeImg + 1}`}
                  className="w-full object-contain bg-black/30"
                  style={{ maxHeight: 360 }}
                />
              </div>
              {l.screenshots.length > 1 && (
                <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                  {l.screenshots.map((src, i) => (
                    <button
                      key={i}
                      onClick={() => setActiveImg(i)}
                      className={`shrink-0 overflow-hidden rounded border-2 ${
                        i === activeImg ? 'border-gold' : 'border-white/10 hover:border-white/25'
                      }`}
                    >
                      <img src={src} alt="" className="h-14 w-20 object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {l.screenshots.length === 0 && (
            <div>
              <SectionTitle>Screenshots</SectionTitle>
              <p className="mt-2 text-xs text-bone/40">Aucun screenshot</p>
            </div>
          )}

          {/* Description */}
          <div>
            <SectionTitle>Description</SectionTitle>
            <p className="mt-2 whitespace-pre-wrap text-sm text-bone/80">{l.description}</p>
          </div>

          {/* Infos générales */}
          <div>
            <SectionTitle>Informations</SectionTitle>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <InfoBox label="Jeu" value={l.game?.title ?? '—'} />
              <InfoBox label="Prix" value={`${l.price.toLocaleString('fr-FR')} ${l.currency}`} tone="gold" />
              <InfoBox label="Pays" value={l.country} />
              <InfoBox label="Statut" value={l.status} badge />
              <InfoBox label="Vues" value={String(l.views)} />
              <InfoBox label="Créée le" value={dateFmt.format(new Date(l.createdAt))} />
              {l.playerCount !== undefined && l.playerCount !== null && (
                <InfoBox label="Nombre de joueurs" value={String(l.playerCount)} />
              )}
              {l.teamStrength !== undefined && l.teamStrength !== null && (
                <InfoBox label="Force d'équipe" value={String(l.teamStrength)} />
              )}
            </div>
          </div>

          {/* Vendeur */}
          <div>
            <SectionTitle>Vendeur</SectionTitle>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <InfoBox label="Nom" value={sellerLabel} />
              {l.seller?.email && <InfoBox label="Email" value={l.seller.email} />}
              {l.seller?.username && <InfoBox label="Username" value={`@${l.seller.username}`} />}
              <InfoBox label="Pays" value={l.country} />
            </div>
          </div>

          {/* Players lists */}
          {(l.epicPlayers?.length ?? 0) > 0 && (
            <div>
              <SectionTitle>Joueurs Epic ({l.epicPlayers!.length})</SectionTitle>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {l.epicPlayers!.map((p, i) => (
                  <span key={i} className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-bone/70">{p}</span>
                ))}
              </div>
            </div>
          )}

          {(l.showTimePlayers?.length ?? 0) > 0 && (
            <div>
              <SectionTitle>Joueurs ShowTime ({l.showTimePlayers!.length})</SectionTitle>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {l.showTimePlayers!.map((p, i) => (
                  <span key={i} className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-bone/70">{p}</span>
                ))}
              </div>
            </div>
          )}

          {(l.featuredPlayers?.length ?? 0) > 0 && (
            <div>
              <SectionTitle>Joueurs Featured ({l.featuredPlayers!.length})</SectionTitle>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {l.featuredPlayers!.map((p, i) => (
                  <span key={i} className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-bone/70">{p}</span>
                ))}
              </div>
            </div>
          )}

          {/* Metadata du compte */}
          {metaEntries.length > 0 && (
            <div>
              <SectionTitle>Métadonnées du compte</SectionTitle>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {metaEntries.map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-navy-mid px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-bone/40">{k}</p>
                    <p className="mt-0.5 text-sm text-bone/80 truncate" title={String(v)}>
                      {typeof v === 'boolean' ? (v ? 'Oui' : 'Non') : String(v)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Motif de rejet existant */}
          {l.moderationNotes && (
            <div>
              <SectionTitle>Motif de rejet</SectionTitle>
              <p className="mt-2 rounded-lg bg-coral/5 border border-coral/10 px-3 py-2 text-sm text-coral/80">
                {l.moderationNotes}
              </p>
            </div>
          )}
        </div>

        {/* Actions footer */}
        <div className="sticky bottom-0 border-t border-white/10 bg-navy-deep px-6 py-4">
          <div className="flex flex-wrap gap-2">
            {canModerate && (
              <>
                <button
                  disabled={busy}
                  onClick={onApprove}
                  className="rounded-full bg-mint/15 px-4 py-2 text-sm text-mint hover:bg-mint/25 disabled:opacity-50"
                >
                  Approuver
                </button>
                <button
                  disabled={busy}
                  onClick={onReject}
                  className="rounded-full bg-coral/15 px-4 py-2 text-sm text-coral hover:bg-coral/25 disabled:opacity-50"
                >
                  Rejeter
                </button>
              </>
            )}
            {canPublish && (
              <button
                disabled={busy}
                onClick={onPublish}
                className="rounded-full bg-mint/15 px-4 py-2 text-sm text-mint hover:bg-mint/25 disabled:opacity-50"
              >
                Publier
              </button>
            )}
            {canUnpublish && (
              <button
                disabled={busy}
                onClick={onUnpublish}
                className="rounded-full bg-gold/15 px-4 py-2 text-sm text-gold hover:bg-gold/25 disabled:opacity-50"
              >
                Masquer
              </button>
            )}
            <button
              disabled={busy}
              onClick={onDelete}
              className="rounded-full bg-coral/15 px-4 py-2 text-sm text-coral hover:bg-coral/25 disabled:opacity-50"
            >
              Supprimer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-bone/40">{children}</p>
  );
}

function InfoBox({
  label,
  value,
  tone,
  badge,
}: {
  label: string;
  value: string;
  tone?: 'gold';
  badge?: boolean;
}) {
  if (badge) {
    return (
      <div className="rounded-lg bg-navy-mid px-3 py-2">
        <p className="text-[10px] uppercase tracking-wide text-bone/40">{label}</p>
        <div className="mt-1">
          <StatusBadge status={value} />
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-lg bg-navy-mid px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-bone/40">{label}</p>
      <p className={`mt-0.5 text-sm ${tone === 'gold' ? 'text-gold font-mono' : 'text-bone/80'}`}>{value}</p>
    </div>
  );
}
