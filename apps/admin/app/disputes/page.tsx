'use client';

import { useEffect, useState, useCallback } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { apiFetch } from '@/lib/api-client';
import { Pagination, StatusBadge } from '@/components/admin-ui';

interface PopulatedTransaction {
  _id: string;
  amount: number;
  currency: string;
  escrowStatus: string;
  paymentReference: string;
}

interface AdminDispute {
  _id: string;
  transaction: PopulatedTransaction | string;
  openedBy: string;
  reason: string;
  description: string;
  status: string;
  resolution?: string;
  createdAt: string;
}

const fmt = new Intl.NumberFormat('fr-FR');

const STATUS_FILTERS = [
  'OPEN',
  'UNDER_REVIEW',
  'WAITING_FOR_BUYER',
  'WAITING_FOR_SELLER',
  'RESOLVED_BUYER',
  'RESOLVED_SELLER',
  'CLOSED',
];

export default function AdminDisputesPage() {
  const [data, setData] = useState<{
    disputes: AdminDispute[];
    page: number;
    totalPages: number;
    total: number;
  } | null>(null);
  const [status, setStatus] = useState('OPEN');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resolving, setResolving] = useState<{ id: string; outcome: 'BUYER' | 'SELLER' } | null>(null);
  const [resolution, setResolution] = useState('');

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ status, page: String(page), pageSize: '20' });
      const res = await apiFetch<{
        disputes: AdminDispute[];
        page: number;
        totalPages: number;
        total: number;
      }>(`/api/v1/admin/disputes?${params.toString()}`);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    }
  }, [status, page]);

  useEffect(() => {
    load();
  }, [load]);

  async function resolve(disputeId: string, outcome: 'BUYER' | 'SELLER') {
    if (!confirm(
      outcome === 'BUYER'
        ? "Trancher en faveur de l'acheteur ? La transaction sera remboursée et les commissions affiliées inversées."
        : 'Trancher en faveur du vendeur ? La transaction sera complétée et le vendeur sera payé.',
    )) {
      return;
    }
    setBusyId(disputeId);
    setError('');
    try {
      await apiFetch(`/api/v1/admin/disputes/${disputeId}/resolve`, {
        method: 'POST',
        json: { outcome, resolution: resolution.trim() || `Tranché en faveur du ${outcome === 'BUYER' ? 'acheteur' : 'vendeur'}` },
      });
      setResolving(null);
      setResolution('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setBusyId(null);
    }
  }

  function tx(d: AdminDispute): PopulatedTransaction | null {
    return typeof d.transaction === 'string' ? null : d.transaction;
  }

  return (
    <AdminShell title="Litiges">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-white/10 bg-navy-deep px-3 py-2 text-sm text-bone outline-none focus:border-gold"
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {data && <span className="font-mono text-xs text-bone/40">{data.total} litige(s)</span>}
      </div>

      {error && <p className="mb-4 text-sm text-coral">{error}</p>}

      {!data ? (
        <p className="text-sm text-bone/50">Chargement…</p>
      ) : data.disputes.length === 0 ? (
        <p className="text-sm text-bone/50">Aucun litige pour ce filtre.</p>
      ) : (
        <>
          <div className="space-y-3">
            {data.disputes.map((d) => {
              const t = tx(d);
              const open = ['OPEN', 'UNDER_REVIEW', 'WAITING_FOR_BUYER', 'WAITING_FOR_SELLER'].includes(d.status);
              return (
                <div key={d._id} className="rounded-ticket border border-white/10 bg-navy-mid p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={d.status} />
                        <span className="text-xs text-bone/40">
                          ouvert le {new Date(d.createdAt).toLocaleDateString('fr-FR')}
                        </span>
                      </div>
                      <p className="mt-2 font-display text-base text-bone">{d.reason}</p>
                      <p className="mt-1 max-w-2xl whitespace-pre-wrap text-sm text-bone/60">{d.description}</p>
                      {t && (
                        <p className="mt-2 font-mono text-xs text-bone/50">
                          Tx {t.paymentReference} — {fmt.format(t.amount)} {t.currency} · état&nbsp;
                          {t.escrowStatus}
                        </p>
                      )}
                      {d.resolution && (
                        <p className="mt-2 rounded-lg bg-navy-deep px-3 py-2 text-xs text-mint">
                          Résolution : {d.resolution}
                        </p>
                      )}
                    </div>
                  </div>

                  {open && resolving?.id === d._id && (
                    <div className="mt-3 space-y-2 border-t border-white/5 pt-3">
                      <textarea
                        autoFocus
                        rows={2}
                        placeholder="Motif de la décision (visible dans l'audit)"
                        value={resolution}
                        onChange={(e) => setResolution(e.target.value)}
                        className="w-full resize-none rounded-lg border border-white/10 bg-navy-deep px-3 py-2 text-xs text-bone outline-none focus:border-gold"
                      />
                      <div className="flex gap-2">
                        <button
                          disabled={busyId === d._id}
                          onClick={() => resolve(d._id, resolving.outcome)}
                          className={`rounded-full px-4 py-1.5 text-xs disabled:opacity-50 ${
                            resolving.outcome === 'BUYER'
                              ? 'bg-coral/15 text-coral hover:bg-coral/25'
                              : 'bg-mint/15 text-mint hover:bg-mint/25'
                          }`}
                        >
                          Confirmer : {resolving.outcome === 'BUYER' ? "rembourser l'acheteur" : 'payer le vendeur'}
                        </button>
                        <button
                          onClick={() => {
                            setResolving(null);
                            setResolution('');
                          }}
                          className="rounded-full border border-white/15 px-4 py-1.5 text-xs text-bone/60 hover:border-white/30"
                        >
                          Annuler
                        </button>
                      </div>
                    </div>
                  )}

                  {open && resolving?.id !== d._id && (
                    <div className="mt-3 flex gap-2 border-t border-white/5 pt-3">
                      <button
                        disabled={busyId === d._id}
                        onClick={() => setResolving({ id: d._id, outcome: 'BUYER' })}
                        className="rounded-full bg-coral/15 px-3 py-1.5 text-xs text-coral hover:bg-coral/25 disabled:opacity-50"
                      >
                        Rembourser l&apos;acheteur
                      </button>
                      <button
                        disabled={busyId === d._id}
                        onClick={() => setResolving({ id: d._id, outcome: 'SELLER' })}
                        className="rounded-full bg-mint/15 px-3 py-1.5 text-xs text-mint hover:bg-mint/25 disabled:opacity-50"
                      >
                        Payer le vendeur
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
        </>
      )}
    </AdminShell>
  );
}
