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
  const [smtpStatus, setSmtpStatus] = useState<
    { ok: boolean; host: string; port: number; secure: boolean; error?: string } | null | undefined
  >(undefined);
  const [smtpBusy, setSmtpBusy] = useState(false);
  const [smtpTo, setSmtpTo] = useState('');
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('');
  const [smtpResult, setSmtpResult] = useState<
    { ok: boolean; stage: string; usedHost?: string; usedPort?: number; error?: string; message?: string } | null
  >(null);

  const load = useCallback(async () => {
    try {
      setStats(await apiFetch<AdminStats>('/api/v1/admin/stats'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    }
  }, []);

  const loadSmtpStatus = useCallback(async () => {
    try {
      const data = await apiFetch<{
        status: { ok: boolean; host: string; port: number; secure: boolean; error?: string };
      }>('/api/v1/admin/email/status');
      setSmtpStatus(data.status);
    } catch {
      setSmtpStatus(null);
    }
  }, []);

  useEffect(() => {
    load();
    loadSmtpStatus();
  }, [load, loadSmtpStatus]);

  async function testEmail() {
    setSmtpBusy(true);
    setSmtpResult(null);
    setError('');
    try {
      const data = await apiFetch<{
        result: { ok: boolean; stage: string; usedHost?: string; usedPort?: number; error?: string; message?: string };
      }>('/api/v1/admin/email/test', {
        method: 'POST',
        json: {
          to: smtpTo.trim() || undefined,
          host: smtpHost.trim() || undefined,
          port: smtpPort.trim() ? Number(smtpPort.trim()) : undefined,
        },
      });
      setSmtpResult(data.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur du test SMTP');
    } finally {
      setSmtpBusy(false);
    }
  }

  return (
    <AdminShell title="Dashboard">
      {error && <p className="mb-4 text-sm text-coral">{error}</p>}

      {smtpStatus !== undefined && (
        <div
          className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-ticket border px-4 py-3 text-sm ${
            smtpStatus && smtpStatus.ok
              ? 'border-mint/30 bg-mint/10'
              : 'border-coral/30 bg-coral/10'
          }`}
        >
          <div className="flex items-center gap-2">
            {smtpStatus && smtpStatus.ok ? (
              <span className="font-mono text-xs text-mint">● SMTP OK</span>
            ) : smtpStatus ? (
              <span className="font-mono text-xs text-coral">● SMTP KO</span>
            ) : (
              <span className="font-mono text-xs text-coral">● SMTP KO (indisponible)</span>
            )}
            {smtpStatus && (
              <span className="font-mono text-[11px] text-bone/50">
                {smtpStatus.host}:{smtpStatus.port} · {smtpStatus.secure ? 'SSL' : 'STARTTLS'}
              </span>
            )}
          </div>
          {smtpStatus && !smtpStatus.ok && (
            <p className="text-xs text-coral/90">
              Les emails ne partent pas. {smtpStatus.error ?? 'Erreur SMTP inconnue.'} — testez ci-dessous
              (port 587 en alternative si 465 est bloqué).
            </p>
          )}
          {smtpStatus && smtpStatus.ok && (
            <p className="text-xs text-mint/80">Email de bienvenue : partent normalement.</p>
          )}
          <button
            onClick={() => {
              setSmtpStatus(undefined);
              loadSmtpStatus();
            }}
            className="rounded-full border border-white/15 px-3 py-1 text-xs text-bone/70 hover:border-white/30"
          >
            Re-tester
          </button>
        </div>
      )}

      <Panel title="Diagnostic email (SMTP)">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={smtpTo}
            onChange={(e) => setSmtpTo(e.target.value)}
            placeholder="Email pour l'envoi de test (optionnel)"
            className="flex-1 min-w-[220px] rounded-lg border border-white/10 bg-navy-deep px-3 py-2 text-sm text-bone outline-none focus:border-gold"
          />
          <button
            disabled={smtpBusy}
            onClick={testEmail}
            className="rounded-full bg-gold px-5 py-2 text-sm font-semibold text-navy-deep hover:bg-gold-soft disabled:opacity-60"
          >
            {smtpBusy ? 'Test…' : 'Tester le SMTP'}
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={smtpHost}
            onChange={(e) => setSmtpHost(e.target.value)}
            placeholder="Hôte SMTP (défaut : .env — ex: smtp.lwspanel.com)"
            className="flex-1 min-w-[240px] rounded-lg border border-white/10 bg-navy-deep px-3 py-2 text-xs text-bone outline-none focus:border-gold"
          />
          <input
            value={smtpPort}
            onChange={(e) => setSmtpPort(e.target.value)}
            placeholder="Port (défaut : .env — ex: 587)"
            className="w-36 rounded-lg border border-white/10 bg-navy-deep px-3 py-2 text-xs text-bone outline-none focus:border-gold"
          />
        </div>
        <p className="mt-1 text-[11px] text-bone/40">
          Si le port 465 timeout, essaie 587 (STARTTLS) — de nombreux hébergeurs bloquent 465 en sortie.
        </p>
        {smtpResult && (
          <div
            className={`mt-3 rounded-lg px-3 py-2 text-xs ${
              smtpResult.ok ? 'bg-mint/15 text-mint' : 'bg-coral/15 text-coral'
            }`}
          >
            {smtpResult.ok
              ? `✔ OK ${smtpResult.usedHost}:${smtpResult.usedPort}${smtpResult.message ? ` — ${smtpResult.message}` : ''}`
              : `✘ Échec (${smtpResult.stage === 'connexion' ? 'connexion' : 'envoi'}) ${smtpResult.usedHost}:${smtpResult.usedPort} — ${smtpResult.error ?? 'erreur inconnue'}`}
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
