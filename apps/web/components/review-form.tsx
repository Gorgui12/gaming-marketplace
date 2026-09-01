'use client';

import { useState } from 'react';
import { Star } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';

export function ReviewForm({
  transactionId,
  onSubmitted,
}: {
  transactionId: string;
  onSubmitted: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    if (rating === 0) {
      setError('Sélectionnez une note avant d\'envoyer');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await apiFetch('/api/v1/reviews', {
        method: 'POST',
        json: { transactionId, rating, comment: comment.trim() || undefined },
      });
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'envoi');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-white/10 bg-navy-deep p-3">
      <p className="mb-2 text-xs text-bone/60">Laisser un avis sur cette transaction</p>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            onMouseEnter={() => setHoverRating(n)}
            onMouseLeave={() => setHoverRating(0)}
            aria-label={`${n} étoile${n > 1 ? 's' : ''}`}
          >
            <Star
              size={22}
              className={
                n <= (hoverRating || rating) ? 'fill-gold text-gold' : 'fill-transparent text-bone/30'
              }
            />
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={1000}
        rows={2}
        placeholder="Commentaire (optionnel)"
        className="mt-2 w-full rounded-lg border border-white/10 bg-navy-mid px-3 py-2 text-sm text-bone outline-none focus:border-gold"
      />
      {error && <p className="mt-1.5 text-xs text-coral">{error}</p>}
      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="mt-2 rounded-full bg-gold px-4 py-2 text-xs font-semibold text-navy-deep hover:bg-gold-soft disabled:opacity-60"
      >
        {submitting ? 'Envoi…' : 'Envoyer mon avis'}
      </button>
    </div>
  );
}
