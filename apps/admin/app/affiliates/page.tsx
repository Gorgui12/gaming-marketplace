'use client';

import { useEffect, useState, useCallback } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { apiFetch } from '@/lib/api-client';
import { Panel } from '@/components/admin-ui';

interface AffiliateUser {
  email: string;
  firstName: string;
  lastName: string;
  username: string;
  country: string;
}

interface AffiliateTier {
  _id: string;
  name: string;
  slug: string;
  defaultCommissionRate: number;
  minConversionsToUpgrade?: number;
}

interface Affiliate {
  _id: string;
  affiliateCode: string;
  displayName: string;
  description?: string;
  socialLinks?: Record<string, string>;
  status: string;
  commissionRate: number;
  totalClicks: number;
  totalConversions: number;
  totalRevenue: number;
  totalCommission: number;
  fraudReviewStatus: string;
  tier?: AffiliateTier;
  user?: AffiliateUser;
  createdAt: string;
}

const STATUS_FILTERS = ['ALL', 'PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED', 'TERMINATED'];

function StatusBadge({ status }: { status: string }) {
  const color =
    status === 'ACTIVE'
      ? 'bg-mint/15 text-mint'
      : status === 'PENDING'
        ? 'bg-gold/15 text-gold'
        : status === 'SUSPENDED' || status === 'REJECTED' || status === 'TERMINATED'
          ? 'bg-coral/15 text-coral'
          : 'bg-white/10 text-bone/60';
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${color}`}>{status}</span>;
}

export default function AdminAffiliatesPage() {
  const [affiliates, setAffiliates] = useState<Affiliate[] | null>(null);
  const [tiers, setTiers] = useState<AffiliateTier[] | null>(null);
  const [filter, setFilter] = useState('PENDING');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tierEdits, setTierEdits] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setError('');
    try {
      const query = filter === 'ALL' ? '' : `?status=${filter}`;
      const data = await apiFetch<{ affiliates: Affiliate[] }>(`/api/v1/admin/affiliates${query}`);
      setAffiliates(data.affiliates);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    }
  }, [filter]);

  const loadTiers = useCallback(async () => {
    try {
      const data = await apiFetch<{ tiers: AffiliateTier[] }>('/api/v1/admin/affiliate-tiers');
      setTiers(data.tiers);
      setTierEdits(
        Object.fromEntries(data.tiers.map((t) => [t._id, String(Math.round(t.defaultCommissionRate * 100))])),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement des niveaux');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadTiers();
  }, [loadTiers]);

  async function review(id: string, decision: 'APPROVE' | 'REJECT', notes?: string) {
    setBusyId(id);
    setError('');
    try {
      await apiFetch(`/api/v1/admin/affiliates/${id}/review`, {
        method: 'POST',
        json: { decision, notes },
      });
      setRejectingId(null);
      setRejectNotes('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setBusyId(null);
    }
  }

  async function setStatus(id: string, status: 'SUSPENDED' | 'ACTIVE' | 'TERMINATED') {
    setBusyId(id);
    try {
      await apiFetch(`/api/v1/admin/affiliates/${id}`, { method: 'PATCH', json: { status } });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setBusyId(null);
    }
  }

  async function saveTierRate(id: string) {
    const raw = (tierEdits[id] ?? '').trim();
    const pct = Number.parseFloat(raw);
    if (Number.isNaN(pct) || pct < 0 || pct > 100) {
      setError('Taux invalide (0–100)');
      return;
    }
    setBusyId(id);
    try {
      await apiFetch(`/api/v1/admin/affiliate-tiers/${id}`, {
        method: 'PATCH',
        json: { defaultCommissionRate: pct / 100 },
      });
      await loadTiers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de mise à jour du niveau');
    } finally {
      setBusyId(null);
    }
  }

  async function changeTier(affiliateId: string, tierSlug: string) {
    if (!tierSlug) return;
    setBusyId(affiliateId);
    try {
      await apiFetch(`/api/v1/admin/affiliates/${affiliateId}/tier`, {
        method: 'POST',
        json: { tierSlug },
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de changement de niveau');
    } finally {
      setBusyId(null);
    }
  }

  function userLabel(a: Affiliate): string {
    if (!a.user) return a.displayName;
    return a.user.username || a.user.email || [a.user.firstName, a.user.lastName].filter(Boolean).join(' ') || a.displayName;
  }

  return (
    <AdminShell title="Affiliés">
      <div className="mb-4 flex gap-2">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-full border px-3 py-1.5 text-xs ${
              filter === s
                ? 'border-gold bg-gold/15 text-gold'
                : 'border-white/15 text-bone/60 hover:border-white/30'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {error && <p className="mb-4 text-sm text-coral">{error}</p>}

      {tiers && (
        <Panel title="Niveaux d'affiliation — taux appliqués sur le net du vendeur">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {tiers.map((t) => (
              <div key={t._id} className="rounded-lg border border-white/10 bg-navy-mid p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-bone">{t.name}</p>
                  <span className="font-mono text-[10px] text-bone/40">niv.</span>
                </div>
                <p className="font-mono text-xs text-bone/40">{t.slug}</p>
                <div className="mt-3 flex items-center gap-2">
                  <input
                    value={tierEdits[t._id] ?? ''}
                    onChange={(e) => setTierEdits((prev) => ({ ...prev, [t._id]: e.target.value }))}
                    className="w-16 rounded-lg border border-white/10 bg-navy-deep px-2 py-1 text-center font-mono text-sm text-bone outline-none focus:border-gold"
                  />
                  <span className="text-xs text-bone/50">%</span>
                  <button
                    disabled={busyId === t._id}
                    onClick={() => saveTierRate(t._id)}
                    className="rounded-full bg-gold px-3 py-1 text-xs text-navy-deep disabled:opacity-50"
                  >
                    Enregistrer
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {!affiliates ? (
        <p className="text-sm text-bone/50">Chargement…</p>
      ) : affiliates.length === 0 ? (
        <p className="text-sm text-bone/50">Aucun affilié dans ce filtre.</p>
      ) : (
        <div className="space-y-2">
          {affiliates.map((a) => {
            const isExpanded = expandedId === a._id;
            return (
              <div key={a._id} className="overflow-hidden rounded-ticket border border-white/10">
                {/* Ligne principale */}
                <div className="flex flex-wrap items-center gap-4 bg-navy-mid px-4 py-3 text-sm">
                  <div className="min-w-[140px] flex-1">
                    <p className="text-bone font-medium">{a.displayName}</p>
                    <p className="font-mono text-xs text-bone/40">{a.affiliateCode}</p>
                  </div>

                  <div className="hidden min-w-[160px] sm:block">
                    {a.user ? (
                      <>
                        <p className="text-bone/70 text-xs">{a.user.firstName} {a.user.lastName}</p>
                        <p className="font-mono text-[11px] text-bone/40">{a.user.email}</p>
                      </>
                    ) : (
                      <p className="text-xs text-bone/40">—</p>
                    )}
                  </div>

                  <div className="hidden md:block">
                    <StatusBadge status={a.status} />
                  </div>

                  <div className="hidden w-24 text-center lg:block">
                    <p className="font-mono text-xs text-bone/60">{(a.commissionRate * 100).toFixed(0)}%</p>
                    <p className="text-[10px] text-bone/30">{a.tier?.name ?? '—'}</p>
                  </div>

                  <div className="hidden w-24 text-center lg:block">
                    <p className="font-mono text-xs text-bone/60">{a.totalClicks} clics</p>
                    <p className="font-mono text-xs text-bone/60">{a.totalConversions} conv.</p>
                  </div>

                  <div className="hidden xl:block">
                    <StatusBadge status={a.fraudReviewStatus} />
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : a._id)}
                      className="rounded-full border border-white/15 px-3 py-1 text-xs text-bone/70 hover:border-white/30"
                    >
                      {isExpanded ? 'Réduire' : 'Détails'}
                    </button>

                    {a.status === 'PENDING' && (
                      <>
                        <button
                          disabled={busyId === a._id}
                          onClick={() => review(a._id, 'APPROVE')}
                          className="rounded-full bg-mint/15 px-3 py-1 text-xs text-mint hover:bg-mint/25 disabled:opacity-50"
                        >
                          Approuver
                        </button>
                        <button
                          disabled={busyId === a._id}
                          onClick={() => {
                            setRejectingId(rejectingId === a._id ? null : a._id);
                            setRejectNotes('');
                          }}
                          className="rounded-full bg-coral/15 px-3 py-1 text-xs text-coral hover:bg-coral/25 disabled:opacity-50"
                        >
                          Rejeter
                        </button>
                      </>
                    )}
                    {a.status === 'ACTIVE' && (
                      <button
                        disabled={busyId === a._id}
                        onClick={() => setStatus(a._id, 'SUSPENDED')}
                        className="rounded-full border border-white/15 px-3 py-1 text-xs text-bone/70 hover:border-white/30 disabled:opacity-50"
                      >
                        Suspendre
                      </button>
                    )}
                    {a.status === 'SUSPENDED' && (
                      <button
                        disabled={busyId === a._id}
                        onClick={() => setStatus(a._id, 'ACTIVE')}
                        className="rounded-full border border-white/15 px-3 py-1 text-xs text-bone/70 hover:border-white/30 disabled:opacity-50"
                      >
                        Réactiver
                      </button>
                    )}
                  </div>
                </div>

                {/* Champ motif rejet inline */}
                {rejectingId === a._id && (
                  <div className="border-t border-white/5 bg-navy-deep px-4 py-3">
                    <textarea
                      autoFocus
                      rows={2}
                      placeholder="Motif du rejet (visible par l'affilié)"
                      value={rejectNotes}
                      onChange={(e) => setRejectNotes(e.target.value)}
                      className="w-full resize-none rounded-lg border border-white/10 bg-navy-mid px-3 py-2 text-xs text-bone outline-none focus:border-gold"
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        disabled={busyId === a._id}
                        onClick={() => review(a._id, 'REJECT', rejectNotes.trim() || undefined)}
                        className="rounded-full bg-coral/15 px-3 py-1.5 text-xs text-coral hover:bg-coral/25 disabled:opacity-50"
                      >
                        Confirmer le rejet
                      </button>
                      <button
                        onClick={() => { setRejectingId(null); setRejectNotes(''); }}
                        className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-bone/60 hover:border-white/30"
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                )}

                {/* Panneau détails expandable */}
                {isExpanded && (
                  <div className="border-t border-white/5 bg-navy-deep px-4 py-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      <InfoCard label="Nom d'affichage" value={a.displayName} />
                      <InfoCard label="Code affilié" value={a.affiliateCode} mono />
                      <InfoCard label="Statut" value={a.status} badge />
                      <InfoCard
                        label="Niveau"
                        value={a.tier ? `${a.tier.name} (${(a.tier.defaultCommissionRate * 100).toFixed(0)}%)` : '—'}
                      />
                      <InfoCard label="Taux commission" value={`${(a.commissionRate * 100).toFixed(0)}%`} />

                      {a.user && (
                        <>
                          <InfoCard label="Utilisateur" value={`${a.user.firstName} ${a.user.lastName}`} />
                          <InfoCard label="Email" value={a.user.email} mono />
                          <InfoCard label="Username" value={`@${a.user.username}`} mono />
                          <InfoCard label="Pays" value={a.user.country} />
                        </>
                      )}

                      <InfoCard label="Clics totaux" value={String(a.totalClicks)} />
                      <InfoCard label="Conversions" value={String(a.totalConversions)} />
                      <InfoCard label="Revenu total" value={`${a.totalRevenue.toLocaleString('fr-FR')}`} />
                      <InfoCard label="Commission totale" value={`${a.totalCommission.toLocaleString('fr-FR')}`} />
                      <InfoCard label="Statut fraude" value={a.fraudReviewStatus} badge />
                      <InfoCard
                        label="Créé le"
                        value={new Date(a.createdAt).toLocaleDateString('fr-FR')}
                      />
                    </div>

                    <div className="mt-4">
                      <p className="text-[10px] uppercase tracking-wide text-bone/40">
                        Réseaux sociaux
                      </p>
                      {(!a.socialLinks || Object.keys(a.socialLinks).length === 0) ? (
                        <p className="mt-1 text-sm text-coral/80">Aucun lien soumis</p>
                      ) : (
                        <div className="mt-1 flex flex-wrap gap-2">
                          {Object.entries(a.socialLinks)
                            .filter(([, url]) => url)
                            .map(([platform, url]) => (
                              <a
                                key={platform}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="rounded-full border border-white/15 bg-navy-mid px-3 py-1 text-xs text-bone/70 hover:border-gold hover:text-gold"
                              >
                                {platform} ↗
                              </a>
                            ))}
                        </div>
                      )}
                    </div>

                    {a.description && (
                      <div className="mt-4">
                        <p className="text-[10px] uppercase tracking-wide text-bone/40">Description</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-bone/70">{a.description}</p>
                      </div>
                    )}

                    {tiers && a.status === 'ACTIVE' && (
                      <div className="mt-4 border-t border-white/5 pt-4">
                        <p className="text-[10px] uppercase tracking-wide text-bone/40">
                          Changer le niveau
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <select
                            value={a.tier?.slug ?? ''}
                            onChange={(e) => {
                              const slug = e.target.value;
                              const selected = tiers.find((t) => t.slug === slug);
                              if (selected) void changeTier(a._id, selected.slug);
                            }}
                            className="rounded-lg border border-white/10 bg-navy-deep px-3 py-1.5 text-xs text-bone outline-none focus:border-gold"
                          >
                            {!a.tier && <option value="">Sélectionner un niveau</option>}
                            {tiers.map((t) => (
                              <option key={t._id} value={t.slug}>
                                {t.name} — {(t.defaultCommissionRate * 100).toFixed(0)}%
                              </option>
                            ))}
                          </select>
                          {busyId === a._id && (
                            <span className="text-xs text-bone/40">Mise à jour…</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </AdminShell>
  );
}

function InfoCard({
  label,
  value,
  mono,
  badge,
}: {
  label: string;
  value: string;
  mono?: boolean;
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
      <p className={`mt-0.5 text-sm text-bone/80 ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}
