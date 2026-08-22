'use client';

import { useEffect, useState, useCallback } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { apiFetch } from '@/lib/api-client';

interface PromoCode {
  _id: string;
  code: string;
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountValue: number;
  usedCount: number;
  usageLimit?: number;
  active: boolean;
}

export default function AdminPromoCodesPage() {
  const [codes, setCodes] = useState<PromoCode[] | null>(null);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    code: '',
    discountType: 'PERCENTAGE' as 'PERCENTAGE' | 'FIXED_AMOUNT',
    discountValue: '',
    usageLimit: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ codes: PromoCode[] }>('/api/v1/admin/promo-codes');
      setCodes(data.codes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await apiFetch('/api/v1/admin/promo-codes', {
        method: 'POST',
        json: {
          code: form.code,
          discountType: form.discountType,
          discountValue: Number(form.discountValue),
          usageLimit: form.usageLimit ? Number(form.usageLimit) : undefined,
        },
      });
      setForm({ code: '', discountType: 'PERCENTAGE', discountValue: '', usageLimit: '' });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de création');
    } finally {
      setSubmitting(false);
    }
  }

  async function deactivate(id: string) {
    try {
      await apiFetch(`/api/v1/admin/promo-codes/${id}/deactivate`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  }

  return (
    <AdminShell
      title="Codes promo"
      action={
        <button
          onClick={() => setShowForm((s) => !s)}
          className="rounded-full bg-gold px-4 py-2 text-sm font-semibold text-navy-deep hover:bg-gold-soft"
        >
          {showForm ? 'Annuler' : '+ Nouveau code'}
        </button>
      }
    >
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="mb-6 grid gap-3 rounded-ticket border border-white/10 bg-navy-mid p-5 sm:grid-cols-4"
        >
          <input
            required
            placeholder="CODE"
            value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
            className="rounded-lg border border-white/10 bg-navy-deep px-3 py-2 text-sm text-bone outline-none focus:border-gold"
          />
          <select
            value={form.discountType}
            onChange={(e) =>
              setForm((f) => ({ ...f, discountType: e.target.value as 'PERCENTAGE' | 'FIXED_AMOUNT' }))
            }
            className="rounded-lg border border-white/10 bg-navy-deep px-3 py-2 text-sm text-bone outline-none focus:border-gold"
          >
            <option value="PERCENTAGE">Pourcentage</option>
            <option value="FIXED_AMOUNT">Montant fixe</option>
          </select>
          <input
            required
            type="number"
            placeholder="Valeur"
            value={form.discountValue}
            onChange={(e) => setForm((f) => ({ ...f, discountValue: e.target.value }))}
            className="rounded-lg border border-white/10 bg-navy-deep px-3 py-2 text-sm text-bone outline-none focus:border-gold"
          />
          <input
            type="number"
            placeholder="Limite d'usage (optionnel)"
            value={form.usageLimit}
            onChange={(e) => setForm((f) => ({ ...f, usageLimit: e.target.value }))}
            className="rounded-lg border border-white/10 bg-navy-deep px-3 py-2 text-sm text-bone outline-none focus:border-gold"
          />
          <button
            type="submit"
            disabled={submitting}
            className="sm:col-span-4 rounded-full bg-gold px-4 py-2 text-sm font-semibold text-navy-deep hover:bg-gold-soft disabled:opacity-60"
          >
            {submitting ? 'Création…' : 'Créer le code'}
          </button>
        </form>
      )}

      {error && <p className="mb-4 text-sm text-coral">{error}</p>}

      {!codes ? (
        <p className="text-sm text-bone/50">Chargement…</p>
      ) : (
        <div className="overflow-hidden rounded-ticket border border-white/10">
          <table className="text-sm">
            <thead className="bg-navy-mid text-left text-xs uppercase tracking-wide text-bone/50">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Réduction</th>
                <th className="px-4 py-3">Utilisations</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {codes.map((c) => (
                <tr key={c._id} className="border-t border-white/5">
                  <td className="px-4 py-3 font-mono">{c.code}</td>
                  <td className="px-4 py-3">
                    {c.discountType === 'PERCENTAGE' ? `${c.discountValue}%` : `${c.discountValue} FCFA`}
                  </td>
                  <td className="px-4 py-3">
                    {c.usedCount}
                    {c.usageLimit ? ` / ${c.usageLimit}` : ''}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs ${
                        c.active ? 'bg-mint/15 text-mint' : 'bg-white/10 text-bone/50'
                      }`}
                    >
                      {c.active ? 'Actif' : 'Désactivé'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {c.active && (
                      <button
                        onClick={() => deactivate(c._id)}
                        className="rounded-full border border-white/15 px-3 py-1 text-xs text-bone/70 hover:border-white/30"
                      >
                        Désactiver
                      </button>
                    )}
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
