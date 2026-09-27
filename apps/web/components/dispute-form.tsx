'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api-client';

const REASONS = [
  { value: 'ACCESS_INCORRECT', label: 'Les accès fournis ne correspondent pas à l\'annonce' },
  { value: 'ACCOUNT_MISMATCH', label: 'Le compte reçu n\'est pas celui annoncé' },
  { value: 'SELLER_UNRESPONSIVE', label: 'Le vendeur ne répond plus' },
  { value: 'ACCOUNT_INACCESSIBLE', label: 'Le compte est inaccessible' },
  { value: 'MAJOR_ISSUE', label: 'Problème majeur (vol, compromission…)' },
  { value: 'OTHER', label: 'Autre motif' },
] as const;

const MIN_DESCRIPTION = 20;

export function DisputeForm({
  transactionId,
  onOpened,
  onCancel,
}: {
  transactionId: string;
  onOpened: () => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState<string>('ACCESS_INCORRECT');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const tooShort = description.trim().length < MIN_DESCRIPTION;

  async function handleSubmit() {
    if (tooShort) {
      setError(
        `Décrivez le problème en ${MIN_DESCRIPTION} caractères minimum : c'est la seule chose que l'équipe pourra examiner.`,
      );
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await apiFetch('/api/v1/disputes', {
        method: 'POST',
        json: { transactionId, reason, description: description.trim() },
      });
      onOpened();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'ouverture du litige");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-coral/30 bg-navy-deep p-3">
      <p className="text-xs text-bone/70">
        Ouvrir un litige gèle le montant : le vendeur ne sera pas payé avant
        l&apos;examen du dossier par notre équipe. C&apos;est la procédure à
        privilégier avant de demander un remboursement.
      </p>

      <label className="mt-3 block text-xs text-bone/60" htmlFor={`dispute-reason-${transactionId}`}>
        Motif
      </label>
      <select
        id={`dispute-reason-${transactionId}`}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="mt-1 w-full rounded-lg border border-white/10 bg-navy-mid px-3 py-2 text-sm text-bone outline-none focus:border-gold"
      >
        {REASONS.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>

      <label
        className="mt-3 block text-xs text-bone/60"
        htmlFor={`dispute-description-${transactionId}`}
      >
        Description détaillée
      </label>
      <textarea
        id={`dispute-description-${transactionId}`}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={4}
        maxLength={3000}
        placeholder="Ce que vous attendiez, ce que vous avez reçu, ce que vous avez déjà tenté…"
        className="mt-1 w-full resize-y rounded-lg border border-white/10 bg-navy-mid px-3 py-2 text-sm text-bone outline-none focus:border-gold"
      />
      <p className={`mt-1 text-[11px] ${tooShort ? 'text-coral/70' : 'text-bone/30'}`}>
        {description.trim().length} / 3000 caractères
      </p>

      {error && <p className="mt-2 text-xs text-coral">{error}</p>}

      <div className="mt-3 flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="rounded-full bg-coral px-4 py-2 text-xs font-semibold text-navy-deep hover:bg-coral/80 disabled:opacity-60"
        >
          {submitting ? 'Ouverture…' : 'Ouvrir le litige'}
        </button>
        <button
          onClick={onCancel}
          disabled={submitting}
          className="rounded-full border border-white/15 px-4 py-2 text-xs text-bone/60 hover:border-white/30 disabled:opacity-60"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}
