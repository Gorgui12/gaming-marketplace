'use client';

import { useEffect, useState, useCallback } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { apiFetch } from '@/lib/api-client';

interface Affiliate {
  _id: string;
  affiliateCode: string;
  displayName: string;
  status: string;
  commissionRate: number;
  totalClicks: number;
  totalConversions: number;
  totalRevenue: number;
  fraudReviewStatus: string;
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
  const [filter, setFilter] = useState('PENDING');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

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

  useEffect(() => {
    load();
  }, [load]);

  async function review(id: string, decision: 'APPROVE' | 'REJECT') {
    setBusyId(id);
    try {
      await apiFetch(`/api/v1/admin/affiliates/${id}/review`, {
        method: 'POST',
        json: { decision },
      });
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

      {!affiliates ? (
        <p className="text-sm text-bone/50">Chargement…</p>
      ) : affiliates.length === 0 ? (
        <p className="text-sm text-bone/50">Aucun affilié dans ce filtre.</p>
      ) : (
        <div className="overflow-hidden rounded-ticket border border-white/10">
          <table className="text-sm">
            <thead className="bg-navy-mid text-left text-xs uppercase tracking-wide text-bone/50">
              <tr>
                <th className="px-4 py-3">Nom</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Taux</th>
                <th className="px-4 py-3">Clics</th>
                <th className="px-4 py-3">Conversions</th>
                <th className="px-4 py-3">Fraude</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {affiliates.map((a) => (
                <tr key={a._id} className="border-t border-white/5">
                  <td className="px-4 py-3">{a.displayName}</td>
                  <td className="px-4 py-3 font-mono text-xs text-bone/70">{a.affiliateCode}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={a.status} />
                  </td>
                  <td className="px-4 py-3">{(a.commissionRate * 100).toFixed(0)}%</td>
                  <td className="px-4 py-3">{a.totalClicks}</td>
                  <td className="px-4 py-3">{a.totalConversions}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={a.fraudReviewStatus} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {a.status === 'PENDING' ? (
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
                            onClick={() => review(a._id, 'REJECT')}
                            className="rounded-full bg-coral/15 px-3 py-1 text-xs text-coral hover:bg-coral/25 disabled:opacity-50"
                          >
                            Rejeter
                          </button>
                        </>
                      ) : a.status === 'ACTIVE' ? (
                        <button
                          disabled={busyId === a._id}
                          onClick={() => setStatus(a._id, 'SUSPENDED')}
                          className="rounded-full border border-white/15 px-3 py-1 text-xs text-bone/70 hover:border-white/30 disabled:opacity-50"
                        >
                          Suspendre
                        </button>
                      ) : a.status === 'SUSPENDED' ? (
                        <button
                          disabled={busyId === a._id}
                          onClick={() => setStatus(a._id, 'ACTIVE')}
                          className="rounded-full border border-white/15 px-3 py-1 text-xs text-bone/70 hover:border-white/30 disabled:opacity-50"
                        >
                          Réactiver
                        </button>
                      ) : null}
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
