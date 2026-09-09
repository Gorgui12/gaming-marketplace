'use client';

import { useEffect, useState, useCallback } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { apiFetch } from '@/lib/api-client';
import { BarChart, BreakdownBars, Panel, StatCard, StatusBadge } from '@/components/admin-ui';

interface AdminStats {
  kpis: {
    totalUsers: number;
    newUsers7d: number;
    pendingListings: number;
    publishedListings: number;
    activeTransactions: number;
    completedTransactions: number;
    gmvCompleted: number;
    platformRevenue: number;
    pendingSellerPayouts: number;
    openDisputes: number;
    affiliatesTotal: number;
    affiliatesPending: number;
    commissionsAvailable: number;
  };
  transactionsByState: { state: string; count: number }[];
  listingsByStatus: { status: string; count: number }[];
  dailySeries: {
    date: string;
    transactions: number;
    volume: number;
    newListings: number;
    newUsers: number;
  }[];
}

const XOF = new Intl.NumberFormat('fr-FR');

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState('');
  const [emailStatus, setEmailStatus] = useState<
    { ok: boolean; provider: string; from: string; error?: string } | null | undefined
  >(undefined);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailResult, setEmailResult] = useState<
    { ok: boolean; stage: string; error?: string; message?: string } | null
  >(null);

  const load = useCallback(async () => {
    try {
      setStats(await apiFetch<AdminStats>('/api/v1/admin/stats'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    }
  }, []);

  const loadEmailStatus = useCallback(async () => {
    try {
      const data = await apiFetch<{
        status: { ok: boolean; provider: string; from: string; error?: string };
      }>('/api/v1/admin/email/status');
      setEmailStatus(data.status);
    } catch {
      setEmailStatus(null);
    }
  }, []);

  useEffect(() => {
    load();
    loadEmailStatus();
  }, [load, loadEmailStatus]);

  async function testEmail() {
    setEmailBusy(true);
    setEmailResult(null);
    setError('');
    try {
      const data = await apiFetch<{
        result: { ok: boolean; stage: string; error?: string; message?: string };
      }>('/api/v1/admin/email/test', {
        method: 'POST',
        json: {
          to: emailTo.trim() || undefined,
        },
      });
      setEmailResult(data.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur du test email');
    } finally {
      setEmailBusy(false);
    }
  }

  return (
    <AdminShell title="Dashboard">
      {error && <p className="mb-4 text-sm text-coral">{error}</p>}

      {emailStatus !== undefined && (
        <div
          className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-ticket border px-4 py-3 text-sm ${
            emailStatus && emailStatus.ok
              ? 'border-mint/30 bg-mint/10'
              : 'border-coral/30 bg-coral/10'
          }`}
        >
          <div className="flex items-center gap-2">
            {emailStatus && emailStatus.ok ? (
              <span className="font-mono text-xs text-mint">● Email OK</span>
            ) : emailStatus ? (
              <span className="font-mono text-xs text-coral">● Email KO</span>
            ) : (
              <span className="font-mono text-xs text-coral">● Email KO (indisponible)</span>
            )}
            {emailStatus && (
              <span className="font-mono text-[11px] text-bone/50">
                {emailStatus.provider} · {emailStatus.from}
              </span>
            )}
          </div>
          {emailStatus && !emailStatus.ok && (
            <p className="text-xs text-coral/90">
              Les emails ne partent pas. {emailStatus.error ?? 'Erreur email inconnue.'} — testez ci-dessous
            </p>
          )}
          {emailStatus && emailStatus.ok && (
            <p className="text-xs text-mint/80">Emails de bienvenue : partent normalement.</p>
          )}
          <button
            onClick={() => {
              setEmailStatus(undefined);
              loadEmailStatus();
            }}
            className="rounded-full border border-white/15 px-3 py-1 text-xs text-bone/70 hover:border-white/30"
          >
            Re-tester
          </button>
        </div>
      )}

      <Panel title="Diagnostic email (Resend API)">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={emailTo}
            onChange={(e) => setEmailTo(e.target.value)}
            placeholder="Email pour l'envoi de test (optionnel)"
            className="flex-1 min-w-[220px] rounded-lg border border-white/10 bg-navy-deep px-3 py-2 text-sm text-bone outline-none focus:border-gold"
          />
          <button
            disabled={emailBusy}
            onClick={testEmail}
            className="rounded-full bg-gold px-5 py-2 text-sm font-semibold text-navy-deep hover:bg-gold-soft disabled:opacity-60"
          >
            {emailBusy ? 'Test…' : 'Tester l\'envoi'}
          </button>
        </div>
        <p className="mt-1 text-[11px] text-bone/40">
          Envoi via l'API Resend (HTTP) — aucun port SMTP nécessaire.
        </p>
        {emailResult && (
          <div
            className={`mt-3 rounded-lg px-3 py-2 text-xs ${
              emailResult.ok ? 'bg-mint/15 text-mint' : 'bg-coral/15 text-coral'
            }`}
          >
            {emailResult.ok
              ? `✔ OK ${emailResult.message ?? 'Email envoyé'}`
              : `✘ Échec (${emailResult.stage === 'connexion' ? 'connexion' : 'envoi'}) — ${emailResult.error ?? 'erreur inconnue'}`}
          </div>
        )}
      </Panel>

      {!stats ? (
        <p className="text-sm text-bone/50">Chargement…</p>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="GMV complété"
              value={`${XOF.format(stats.kpis.gmvCompleted)} XOF`}
              hint={`${stats.kpis.completedTransactions} transactions`}
              tone="gold"
            />
            <StatCard
              label="Revenus plateforme"
              value={`${XOF.format(stats.kpis.platformRevenue)} XOF`}
              hint="frais sur transactions complétées"
              tone="mint"
            />
            <StatCard
              label="Transactions actives"
              value={stats.kpis.activeTransactions}
              hint="séquestre logique ouvert"
            />
            <StatCard
              label="Payouts vendeurs dus"
              value={`${XOF.format(stats.kpis.pendingSellerPayouts)} XOF`}
              tone="gold"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Annonces en modération"
              value={stats.kpis.pendingListings}
              hint={`${stats.kpis.publishedListings} publiées`}
              tone={stats.kpis.pendingListings > 0 ? 'coral' : 'default'}
            />
            <StatCard
              label="Litiges ouverts"
              value={stats.kpis.openDisputes}
              tone={stats.kpis.openDisputes > 0 ? 'coral' : 'mint'}
            />
            <StatCard
              label="Utilisateurs"
              value={XOF.format(stats.kpis.totalUsers)}
              hint={`+${stats.kpis.newUsers7d} sur 7 jours`}
            />
            <StatCard
              label="Affiliés"
              value={stats.kpis.affiliatesTotal}
              hint={`${stats.kpis.affiliatesPending} candidature(s) en attente · ${XOF.format(
                stats.kpis.commissionsAvailable,
              )} XOF à verser`}
              tone={stats.kpis.affiliatesPending > 0 ? 'gold' : 'default'}
            />
          </div>

          <Panel title="Transactions — 14 derniers jours (volume XOF)">
            <BarChart
              data={stats.dailySeries.map((d) => ({ label: d.date, value: d.volume }))}
              formatValue={(v) => `${XOF.format(v)} XOF`}
            />
          </Panel>

          <div className="grid gap-6 lg:grid-cols-3">
            <Panel title="Transactions / jour (14 j)">
              <BarChart
                data={stats.dailySeries.map((d) => ({ label: d.date, value: d.transactions }))}
                height={140}
                color="#3ECF8E"
              />
            </Panel>
            <Panel title="Nouvelles annonces / jour (14 j)">
              <BarChart
                data={stats.dailySeries.map((d) => ({ label: d.date, value: d.newListings }))}
                height={140}
                color="#E8B84B"
              />
            </Panel>
            <Panel title="Nouveaux utilisateurs / jour (14 j)">
              <BarChart
                data={stats.dailySeries.map((d) => ({ label: d.date, value: d.newUsers }))}
                height={140}
                color="#FF6B5B"
              />
            </Panel>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Répartition des transactions par état">
              <BreakdownBars
                rows={stats.transactionsByState.map((r) => ({ label: r.state, value: r.count }))}
                color="#E8B84B"
              />
            </Panel>
            <Panel title="Répartition des annonces par statut">
              <BreakdownBars
                rows={stats.listingsByStatus.map((r) => ({ label: r.status, value: r.count }))}
                color="#3ECF8E"
              />
            </Panel>
          </div>

          <Panel title="Détail des états de transaction">
            <div className="flex flex-wrap gap-2">
              {stats.transactionsByState
                .filter((t) => t.count > 0)
                .map((t) => (
                  <span key={t.state} className="flex items-center gap-1.5">
                    <StatusBadge status={t.state} />
                    <span className="font-mono text-xs text-bone/50">×{t.count}</span>
                  </span>
                ))}
            </div>
          </Panel>
        </div>
      )}
    </AdminShell>
  );
}
