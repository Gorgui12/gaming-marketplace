'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api-client';

const PLATFORM_OPTIONS = [
  { value: 'TIKTOK', label: 'TikTok' },
  { value: 'YOUTUBE', label: 'YouTube' },
  { value: 'INSTAGRAM', label: 'Instagram' },
  { value: 'FACEBOOK', label: 'Facebook' },
  { value: 'WHATSAPP', label: 'Groupe WhatsApp' },
  { value: 'TELEGRAM', label: 'Groupe Telegram' },
] as const;

export function AffiliateApplyForm() {
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [followerCount, setFollowerCount] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  function togglePlatform(value: string) {
    setPlatforms((prev) =>
      prev.includes(value) ? prev.filter((p) => p !== value) : [...prev, value],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (platforms.length === 0) {
      setErrorMessage('Sélectionnez au moins une plateforme');
      setStatus('error');
      return;
    }
    setStatus('loading');
    setErrorMessage('');
    try {
      await apiFetch('/api/v1/affiliates/apply', {
        method: 'POST',
        json: {
          displayName,
          description: description || undefined,
          platforms,
          followerCount: followerCount ? Number(followerCount) : undefined,
        },
      });
      setStatus('success');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Une erreur est survenue');
      setStatus('error');
    }
  }

  if (status === 'success') {
    return (
      <div className="rounded-ticket border border-mint/30 bg-mint/10 p-6 text-center">
        <p className="font-display text-lg text-bone">Candidature envoyée</p>
        <p className="mt-2 text-sm text-bone/60">
          Nous l&apos;examinons et revenons vers vous rapidement. Connectez-vous ensuite pour
          suivre son statut.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-ticket border border-white/10 bg-navy-mid p-6">
      <div className="grid gap-5">
        <Field label="Nom d'affichage">
          <input
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="ex: Gorgui Gaming"
            className="w-full rounded-lg border border-white/10 bg-navy-deep px-3 py-2 text-sm text-bone outline-none focus:border-gold"
          />
        </Field>

        <Field label="Vos plateformes">
          <div className="flex flex-wrap gap-2">
            {PLATFORM_OPTIONS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => togglePlatform(p.value)}
                className={`rounded-full border px-3 py-1.5 text-xs transition ${
                  platforms.includes(p.value)
                    ? 'border-gold bg-gold/15 text-gold'
                    : 'border-white/15 text-bone/60 hover:border-white/30'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Nombre d'abonnés (approximatif)">
          <input
            type="number"
            min={0}
            value={followerCount}
            onChange={(e) => setFollowerCount(e.target.value)}
            placeholder="ex: 15000"
            className="w-full rounded-lg border border-white/10 bg-navy-deep px-3 py-2 text-sm text-bone outline-none focus:border-gold"
          />
        </Field>

        <Field label="Décrivez votre audience (optionnel)">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="ex: joueurs eFootball 18-30 ans au Sénégal, contenu de gameplay et astuces"
            className="w-full rounded-lg border border-white/10 bg-navy-deep px-3 py-2 text-sm text-bone outline-none focus:border-gold"
          />
        </Field>

        {status === 'error' && <p className="text-sm text-coral">{errorMessage}</p>}

        <button
          type="submit"
          disabled={status === 'loading'}
          className="rounded-full bg-gold px-6 py-3 text-sm font-semibold text-navy-deep hover:bg-gold-soft disabled:opacity-60"
        >
          {status === 'loading' ? 'Envoi en cours…' : 'Envoyer ma candidature'}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-bone/50">
        {label}
      </span>
      {children}
    </label>
  );
}
