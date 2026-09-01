'use client';

import { useEffect, useState, useCallback } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { apiFetch } from '@/lib/api-client';
import { Panel } from '@/components/admin-ui';

interface DbStats {
  counts: Record<string, number>;
  orphans: Record<string, number>;
}

const COLLECTION_LABELS: Record<string, string> = {
  users: 'Utilisateurs',
  games: 'Jeux',
  listings: 'Annonces',
  transactions: 'Transactions',
  disputes: 'Litiges',
  reviews: 'Avis',
  notifications: 'Notifications',
  conversations: 'Conversations',
  messages: 'Messages',
  posts: 'Articles de blog',
  promoCodes: 'Codes promo',
  affiliates: 'Affiliés',
  affiliateCampaigns: 'Campagnes affiliés',
  affiliateClicks: 'Clics affiliés',
  affiliateConversions: 'Conversions',
  affiliatePayouts: 'Payouts affiliés',
  secureCredentials: 'Accès compte (cryptés)',
  auditLogs: 'Logs d’audit',
};

const ORPHAN_LABELS: Record<string, string> = {
  annonces_sans_jeu: 'Annonces sans jeu',
  annonces_sans_vendeur: 'Annonces sans vendeur',
  transactions_sans_annonce: 'Transactions sans annonce',
  transactions_sans_acheteur: 'Transactions sans acheteur',
  transactions_sans_vendeur: 'Transactions sans vendeur',
  litiges_sans_transaction: 'Litiges sans transaction',
  notifications_sans_utilisateur: 'Notifications sans utilisateur',
  avis_sans_transaction: 'Avis sans transaction',
  avis_sans_auteur: 'Avis sans auteur',
  avis_sans_cible: 'Avis sans cible',
  messages_sans_conversation: 'Messages sans conversation',
  messages_sans_expediteur: 'Messages sans expéditeur',
  articles_sans_auteur: 'Articles sans auteur',
  campagnes_sans_affilie: 'Campagnes sans affilié',
  clics_sans_affilie: 'Clics sans affilié',
  clics_sans_campagne: 'Clics sans campagne',
  conversions_sans_affilie: 'Conversions sans affilié',
  conversions_sans_transaction: 'Conversions sans transaction',
  conversions_sans_acheteur: 'Conversions sans acheteur',
  payouts_sans_affilie: 'Payouts sans affilié',
  codes_promo_sans_affilie: 'Codes promo sans affilié',
  acces_compte_sans_annonce: 'Accès compte sans annonce',
  acces_compte_sans_vendeur: 'Accès compte sans vendeur',
  conversations_sans_transaction_ou_vides: 'Conversations orphelines/vides',
};

export default function AdminDatabasePage() {
  const [stats, setStats] = useState<DbStats | null>(null);
  const [error, setError] = useState('');
  const [cleaning, setCleaning] = useState(false);
  const [resetTarget, setResetTarget] = useState('listings');
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetting, setResetting] = useState(false);
  const [lastCleanup, setLastCleanup] = useState<Record<string, number> | null>(null);
  const [lastReset, setLastReset] = useState<string>('');

  const load = useCallback(async () => {
    try {
      setStats(await apiFetch<DbStats>('/api/v1/admin/db'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function cleanup() {
    setCleaning(true);
    setError('');
    try {
      const res = await apiFetch<{ deleted: Record<string, number> }>(
        '/api/v1/admin/db/orphans/cleanup',
        { method: 'POST' },
      );
      setLastCleanup(res.deleted);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setCleaning(false);
    }
  }

  async function resetCollection() {
    if (!window.confirm(`Vider TOUTE la collection « ${resetTarget} » ? Cette action est irréversible.`)) {
      return;
    }
    setResetting(true);
    setError('');
    try {
      const res = await apiFetch<{ target: string; deletedCount: number }>(
        '/api/v1/admin/db/reset',
        { method: 'POST', json: { target: resetTarget, confirm: resetConfirm } },
      );
      setLastReset(`${res.target} : ${res.deletedCount} document(s) supprimé(s)`);
      setResetConfirm('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setResetting(false);
    }
  }

  const totalOrphans = stats
    ? Object.values(stats.orphans).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <AdminShell title="Base de données">
      {error && <p className="mb-4 text-sm text-coral">{error}</p>}

      {!stats ? (
        <p className="text-sm text-bone/50">Chargement…</p>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(stats.counts).map(([key, count]) => (
              <div
                key={key}
                className="rounded-ticket border border-white/10 bg-navy-mid p-3"
              >
                <p className="text-xs text-bone/40">{COLLECTION_LABELS[key] ?? key}</p>
                <p className="mt-1 font-mono text-xl text-bone">{count}</p>
              </div>
            ))}
          </div>

          <Panel
            title={`Orphelins à nettoyer (${totalOrphans})`}
          >
            {lastCleanup && (
              <p className="mb-3 rounded-lg bg-mint/10 px-3 py-2 text-xs text-mint">
                Nettoyage effectué : {Object.values(lastCleanup).reduce((a, b) => a + b, 0)} document(s)
                supprimé(s).
              </p>
            )}
            {Object.keys(stats.orphans).length === 0 ? (
              <p className="text-sm text-bone/50">Aucune donnée.</p>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  {Object.entries(stats.orphans)
                    .filter(([, n]) => n > 0)
                    .map(([key, n]) => (
                      <div key={key} className="flex items-center justify-between text-sm">
                        <span className="text-bone/70">{ORPHAN_LABELS[key] ?? key}</span>
                        <span className="font-mono text-xs text-coral">{n}</span>
                      </div>
                    ))}
                </div>
                <button
                  disabled={cleaning || totalOrphans === 0}
                  onClick={cleanup}
                  className="rounded-full bg-gold px-4 py-2 text-sm font-semibold text-navy-deep hover:bg-gold-soft disabled:opacity-50"
                >
                  {cleaning ? 'Nettoyage…' : 'Nettoyer les orphelins'}
                </button>
              </div>
            )}
          </Panel>

          <Panel title="Zone dangereuse — vider une collection (SUPER_ADMIN uniquement)">
            <p className="mb-3 text-xs text-bone/40">
              Supprime définitivement tous les documents de la collection sélectionnée.
              Irréversible. Tapez le nom exact de la collection pour confirmer.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-bone/40">Collection</span>
                <select
                  value={resetTarget}
                  onChange={(e) => setResetTarget(e.target.value)}
                  className="rounded-lg border border-white/10 bg-navy-deep px-3 py-2 text-sm text-bone outline-none focus:border-coral"
                >
                  {Object.keys(stats.counts).map((key) => (
                    <option key={key} value={key}>
                      {COLLECTION_LABELS[key] ?? key}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-bone/40">Confirmation</span>
                <input
                  placeholder={`Tapez : ${resetTarget}`}
                  value={resetConfirm}
                  onChange={(e) => setResetConfirm(e.target.value)}
                  className="w-56 rounded-lg border border-white/10 bg-navy-deep px-3 py-2 text-sm text-bone outline-none focus:border-coral"
                />
              </div>
              <button
                disabled={resetting || resetConfirm !== resetTarget}
                onClick={resetCollection}
                className="rounded-full bg-coral/15 px-4 py-2 text-sm font-semibold text-coral hover:bg-coral/25 disabled:opacity-40"
              >
                {resetting ? 'Suppression…' : 'Vider la collection'}
              </button>
            </div>
            {lastReset && (
              <p className="mt-3 rounded-lg bg-coral/10 px-3 py-2 text-xs text-coral">{lastReset}</p>
            )}
          </Panel>
        </div>
      )}
    </AdminShell>
  );
}