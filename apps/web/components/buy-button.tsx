'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { getOrCreateTrackingSessionId } from '@/lib/tracking-session';

export function BuyButton({
  listingId,
  compact = false,
}: {
  listingId: string;
  compact?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleBuy() {
    setLoading(true);
    setError('');
    try {
      const sessionId = getOrCreateTrackingSessionId();
      const result = await apiFetch<{ paymentUrl: string }>('/api/v1/transactions', {
        method: 'POST',
        json: { listingId, sessionId },
      });
      window.location.href = result.paymentUrl;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible d'initier l'achat pour le moment",
      );
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={handleBuy}
        disabled={loading}
        className={`w-full rounded-full bg-gold font-semibold text-navy-deep hover:bg-gold-soft disabled:opacity-60 ${
          compact ? 'px-4 py-2.5 text-sm' : 'px-6 py-3 text-sm'
        }`}
      >
        {loading ? 'Redirection…' : compact ? 'Acheter' : 'Acheter ce compte'}
      </button>
      {error && <p className="mt-2 text-xs text-coral sm:text-sm">{error}</p>}
      {!compact && (
        <p className="mt-3 text-xs text-bone/40">
          Paiement Mobile Money sécurisé. Les fonds ne sont libérés au vendeur qu&apos;après votre
          confirmation.
        </p>
      )}
    </div>
  );
}
