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
  const [promoCode, setPromoCode] = useState('');
  const [phone, setPhone] = useState('');

  async function handleBuy() {
    setLoading(true);
    setError('');
    try {
      const sessionId = getOrCreateTrackingSessionId();
      const trimmedCode = promoCode.trim();
      const trimmedPhone = phone.trim();
      if (!trimmedPhone) {
        setError('Veuillez saisir votre numéro de téléphone');
        setLoading(false);
        return;
      }
      const result = await apiFetch<{ paymentUrl: string }>('/api/v1/transactions', {
        method: 'POST',
        json: {
          listingId,
          sessionId,
          ...(trimmedCode ? { promoCode: trimmedCode } : {}),
          ...(trimmedPhone ? { phone: trimmedPhone } : {}),
        },
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
    <div className={compact ? 'space-y-2' : ''}>
      <div className={compact ? 'mb-0' : 'mb-3'}>
        <label
          htmlFor={`phone-number${compact ? '-compact' : ''}`}
          className="block text-[11px] uppercase tracking-wider text-bone/40"
        >
          Numéro Wave / Orange Money
        </label>
        <input
          id={`phone-number${compact ? '-compact' : ''}`}
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={compact ? 'N° de téléphone' : 'Ex : 77 123 45 67'}
          spellCheck={false}
          disabled={loading}
          className="mt-1 w-full rounded-lg border border-white/10 bg-navy-deep px-3 py-2 text-sm text-bone outline-none placeholder:text-bone/30 focus:border-gold"
        />
      </div>
      {!compact && (
        <div className="mb-3">
          <label
            htmlFor="promo-code"
            className="block text-[11px] uppercase tracking-wider text-bone/40"
          >
            Code promo (optionnel)
          </label>
          <input
            id="promo-code"
            type="text"
            value={promoCode}
            onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
            placeholder="Ex : JOHNDOE10"
            spellCheck={false}
            disabled={loading}
            className="mt-1 w-full rounded-lg border border-white/10 bg-navy-deep px-3 py-2 text-sm text-bone outline-none placeholder:text-bone/30 focus:border-gold"
          />
        </div>
      )}
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
