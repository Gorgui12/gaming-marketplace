'use client';

import { useEffect, useState, useCallback } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { apiFetch } from '@/lib/api-client';
import { Pagination, StatusBadge } from '@/components/admin-ui';

interface PopulatedUser {
  _id: string;
  email: string;
  username: string;
}

interface PopulatedListing {
  _id: string;
  title: string;
  slug: string;
}

interface AdminTransaction {
  _id: string;
  buyer: PopulatedUser | string;
  seller: PopulatedUser | string;
  listing: PopulatedListing | string;
  amount: number;
  currency: string;
  platformFee: number;
  sellerAmount: number;
  escrowStatus: string;
  paymentStatus: string;
  paymentReference: string;
  appliedPromoCode?: string;
  discountAmount: number;
  createdAt: string;
}

const STATES = [
  'ALL',
  'CREATED',
  'PAYMENT_PENDING',
  'PAYMENT_CONFIRMED',
  'ESCROW_ACTIVE',
  'SELLER_DELIVERED',
  'BUYER_REVIEWING',
  'DISPUTED',
  'REFUND_PENDING',
  'REFUNDED',
  'SELLER_PAYOUT_PENDING',
  'COMPLETED',
  'CANCELLED',
];

const fmt = new Intl.NumberFormat('fr-FR');

function label(u: PopulatedUser | string | undefined): string {
  if (!u) return '—';
  if (typeof u === 'string') return u;
  return u.email ?? u.username ?? u._id;
}

function listingTitle(l: PopulatedListing | string | undefined): string {
  if (!l) return '—';
  if (typeof l === 'string') return l;
  return l.title;
}

export default function AdminTransactionsPage() {
  const [data, setData] = useState<{
    transactions: AdminTransaction[];
    page: number;
    totalPages: number;
    total: number;
  } | null>(null);
  const [state, setState] = useState('DISPUTED');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [refunding, setRefunding] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ state, page: String(page), pageSize: '20' });
      const res = await apiFetch<{
        transactions: AdminTransaction[];
        page: number;
        totalPages: number;
        total: number;
      }>(`/api/v1/admin/transactions?${params.toString()}`);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    }
  }, [state, page]);

  useEffect(() => {
    load();
  }, [load]);

  async function refund(tx: AdminTransaction) {
    if (!confirm(`Rembourser ${fmt.format(tx.amount)} ${tx.currency} à l'acheteur ? Les commissions affiliées seront inversées.`)) {
      return;
    }
    setBusyId(tx._id);
    setError('');
    try {
      await apiFetch(`/api/v1/transactions/${tx._id}/admin-refund`, {
        method: 'POST',
        json: { reason: refundReason.trim() || `Remboursement admin depuis le dashboard (${tx.paymentReference})` },
      });
      setRefunding(null);
      setRefundReason('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AdminShell title="Transactions">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={state}
          onChange={(e) => {
            setState(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-white/10 bg-navy-deep px-3 py-2 text-sm text-bone outline-none focus:border-gold"
        >
          {STATES.map((s) => (
            <option key={s} value={s}>
              {s === 'ALL' ? 'Tous les états' : s}
            </option>
          ))}
        </select>
        {data && (
          <span className="font-mono text-xs text-bone/40">{data.total} transaction(s)</span>
        )}
      </div>

      {error && <p className="mb-4 text-sm text-coral">{error}</p>}

      {!data ? (
        <p className="text-sm text-bone/50">Chargement…</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-ticket border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-navy-mid text-left text-xs uppercase tracking-wide text-bone/50">
                <tr>
                  <th className="px-4 py-3">Référence</th>
                  <th className="px-4 py-3">Annonce</th>
                  <th className="px-4 py-3">Acheteur / Vendeur</th>
                  <th className="px-4 py-3">Montant</th>
                  <th className="px-4 py-3">Frais / Vendeur</th>
                  <th className="px-4 py-3">État</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.transactions.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-bone/50">
                      Aucune transaction pour ce filtre.
                    </td>
                  </tr>
                )}
                {data.transactions.map((tx) => (
                  <tr key={tx._id} className="border-t border-white/5 align-top">
                    <td className="px-4 py-3">
                      <p className="font-mono text-xs text-bone">{tx.paymentReference}</p>
                      <p className="text-xs text-bone/40">
                        {new Date(tx.createdAt).toLocaleDateString('fr-FR')}
                      </p>
                    </td>
                    <td className="max-w-[220px] truncate px-4 py-3 text-bone/80">
                      {listingTitle(tx.listing)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      <p className="text-bone/70">A: {label(tx.buyer)}</p>
                      <p className="text-bone/50">V: {label(tx.seller)}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-gold">
                      {fmt.format(tx.amount)} {tx.currency}
                      {tx.discountAmount > 0 && (
                        <p className="text-xs text-mint">
                          promo {tx.appliedPromoCode} (-{fmt.format(tx.discountAmount)})
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-bone/60">
                      frais {fmt.format(tx.platformFee)}
                      <br />
                      vendeur {fmt.format(tx.sellerAmount)}
                    </td>
                    <td className="px-4 py-3 space-y-1.5">
                      <StatusBadge status={tx.escrowStatus} />
                      <br />
                      <span className="font-mono text-[10px] text-bone/40">{tx.paymentStatus}</span>
                    </td>
                    <td className="px-4 py-3">
                      {tx.escrowStatus === 'DISPUTED' &&
                        (refunding === tx._id ? (
                          <div className="flex w-56 flex-col gap-2">
                            <input
                              autoFocus
                              placeholder="Motif du remboursement"
                              value={refundReason}
                              onChange={(e) => setRefundReason(e.target.value)}
                              className="w-full rounded-lg border border-white/10 bg-navy-deep px-2.5 py-1.5 text-xs text-bone outline-none focus:border-coral"
                            />
                            <div className="flex gap-2">
                              <button
                                disabled={busyId === tx._id}
                                onClick={() => refund(tx)}
                                className="rounded-full bg-coral/15 px-3 py-1 text-xs text-coral hover:bg-coral/25 disabled:opacity-50"
                              >
                                Confirmer
                              </button>
                              <button
                                onClick={() => {
                                  setRefunding(null);
                                  setRefundReason('');
                                }}
                                className="rounded-full border border-white/15 px-3 py-1 text-xs text-bone/60 hover:border-white/30"
                              >
                                Annuler
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            disabled={busyId === tx._id}
                            onClick={() => setRefunding(tx._id)}
                            className="rounded-full bg-coral/15 px-3 py-1 text-xs text-coral hover:bg-coral/25 disabled:opacity-50"
                          >
                            Rembourser l&apos;acheteur
                          </button>
                        ))}
                    </td>
                  </tr>
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
