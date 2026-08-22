'use client';

import { useEffect, useState, useCallback } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { apiFetch } from '@/lib/api-client';

interface Payout {
  _id: string;
  affiliate: string;
  amount: number;
  currency: string;
  status: string;
  method?: string;
  reference?: string;
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === 'PAID'
      ? 'bg-mint/15 text-mint'
      : status === 'FAILED' || status === 'CANCELLED'
        ? 'bg-coral/15 text-coral'
        : 'bg-gold/15 text-gold';
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${color}`}>{status}</span>;
}

export default function AdminPayoutsPage() {
  const [payouts, setPayouts] = useState<Payout[] | null>(null);
  const [error, setError] = useState('');
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, { method: string; reference: string }>>({});

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ payouts: Payout[] }>('/api/v1/admin/affiliate-payouts');
      setPayouts(data.payouts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function markPaid(id: string) {
    const entry = form[id];
    if (!entry?.method || !entry?.reference) {
      setError('Méthode et référence requises pour marquer un paiement effectué');
      return;
    }
    setError('');
    try {
      await apiFetch(`/api/v1/admin/affiliate-payouts/${id}/mark-paid`, {
        method: 'POST',
        json: entry,
      });
      setMarkingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  }

  return (
    <AdminShell title="Paiements affiliés">
      <p className="mb-4 text-xs text-bone/40">
        Workflow manuel (§24) — aucun virement automatique. Effectuez le paiement via votre canal
        habituel (Mobile Money, virement) puis marquez-le comme payé avec la référence.
      </p>
      {error && <p className="mb-4 text-sm text-coral">{error}</p>}
      {!payouts ? (
        <p className="text-sm text-bone/50">Chargement…</p>
      ) : payouts.length === 0 ? (
        <p className="text-sm text-bone/50">Aucune demande de paiement.</p>
      ) : (
        <div className="overflow-hidden rounded-ticket border border-white/10">
          <table className="text-sm">
            <thead className="bg-navy-mid text-left text-xs uppercase tracking-wide text-bone/50">
              <tr>
                <th className="px-4 py-3">Affilié</th>
                <th className="px-4 py-3">Montant</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Référence</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((p) => (
                <tr key={p._id} className="border-t border-white/5">
                  <td className="px-4 py-3 font-mono text-xs text-bone/70">{p.affiliate}</td>
                  <td className="px-4 py-3">
                    {p.amount.toLocaleString('fr-FR')} {p.currency}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="px-4 py-3 text-bone/60">{p.reference ?? '—'}</td>
                  <td className="px-4 py-3">
                    {p.status === 'PENDING' &&
                      (markingId === p._id ? (
                        <div className="flex gap-2">
                          <input
                            placeholder="Méthode"
                            className="w-24 rounded-lg border border-white/10 bg-navy-deep px-2 py-1 text-xs text-bone outline-none focus:border-gold"
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                [p._id]: { ...f[p._id], method: e.target.value, reference: f[p._id]?.reference ?? '' },
                              }))
                            }
                          />
                          <input
                            placeholder="Référence"
                            className="w-32 rounded-lg border border-white/10 bg-navy-deep px-2 py-1 text-xs text-bone outline-none focus:border-gold"
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                [p._id]: { ...f[p._id], reference: e.target.value, method: f[p._id]?.method ?? '' },
                              }))
                            }
                          />
                          <button
                            onClick={() => markPaid(p._id)}
                            className="rounded-full bg-mint/15 px-3 py-1 text-xs text-mint hover:bg-mint/25"
                          >
                            Confirmer
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setMarkingId(p._id)}
                          className="rounded-full border border-white/15 px-3 py-1 text-xs text-bone/70 hover:border-white/30"
                        >
                          Marquer payé
                        </button>
                      ))}
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
