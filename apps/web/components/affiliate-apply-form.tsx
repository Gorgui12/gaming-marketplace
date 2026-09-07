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

const PLATFORM_HINTS: Record<string, string> = {
  TIKTOK: 'tiktok.com/@votre-compte',
  YOUTUBE: 'youtube.com/@votre-chaine',
  INSTAGRAM: 'instagram.com/votre-compte',
  FACEBOOK: 'facebook.com/votre-page',
  WHATSAPP: 'Lien d\'invitation de votre groupe',
  TELEGRAM: 'Lien d\'invitation de votre groupe',
};

export function AffiliateApplyForm() {
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [socialLinks, setSocialLinks] = useState<Record<string, string>>({});
  const [followerCount, setFollowerCount] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  function setPlatformLink(platform: string, url: string) {
    setSocialLinks((prev) => ({ ...prev, [platform]: url }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const hasLink = Object.values(socialLinks).some((url) => url && url.trim().length > 0);
    if (!hasLink) {
      setErrorMessage('Saisissez au moins un lien vers un réseau social');
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
          socialLinks,
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

        <Field label="Liens de vos réseaux sociaux (obligatoire)">
          <div className="space-y-3">
            {PLATFORM_OPTIONS.map((p) => (
              <div key={p.value}>
                <label
                  htmlFor={`link-${p.value}`}
                  className="mb-1 block text-xs font-medium text-bone/60"
                >
                  {p.label}
                </label>
                <input
                  id={`link-${p.value}`}
                  type="url"
                  value={socialLinks[p.value] ?? ''}
                  onChange={(e) => setPlatformLink(p.value, e.target.value)}
                  placeholder={`https://${PLATFORM_HINTS[p.value]}`}
                  className="w-full rounded-lg border border-white/10 bg-navy-deep px-3 py-2 text-sm text-bone outline-none focus:border-gold"
                />
              </div>
            ))}
            <p className="text-xs text-bone/50">
              Au moins un lien est obligatoire — l&apos;équipe vérifie votre audience avant
              approbation.
            </p>
          </div>
        </Field>

        <Field label="Nombres d'abonnés (approximatif)">
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
