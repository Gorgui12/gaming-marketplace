'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { notifyAuthChanged, useCurrentUser } from '@/lib/use-current-user';
import { SiteNav } from '@/components/site-nav';

declare global {
  interface Window {
    google?: { accounts: { id: { initialize: (config: Record<string, unknown>) => void; renderButton: (el: HTMLElement, config: Record<string, unknown>) => void; prompt: () => void } } };
  }
}

export default function LoginPage() {
  const router = useRouter();
  const { user, loading } = useCurrentUser();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.replace('/marketplace');
    }
  }, [loading, user, router]);

  // Charger Google Identity Services
  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId || !window.google) return;

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: handleGoogleCredential,
    });

    const btnEl = document.getElementById('google-signin-btn');
    if (btnEl) {
      window.google.accounts.id.renderButton(btnEl, {
        theme: 'filled_black',
        size: 'large',
        text: 'continue_with',
        width: 300,
      });
    }
  }, []);

  async function handleGoogleCredential(response: { credential?: string }) {
    if (!response.credential) return;
    setError('');
    setSubmitting(true);
    try {
      await apiFetch('/api/v1/auth/google', {
        method: 'POST',
        json: { idToken: response.credential },
      });
      notifyAuthChanged();
      router.push('/marketplace');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de connexion Google');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await apiFetch('/api/v1/auth/login', { method: 'POST', json: { email, password } });
      notifyAuthChanged();
      router.push('/marketplace');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de connexion');
    } finally {
      setSubmitting(false);
    }
  }

  if (!loading && user) {
    return (
      <>
        <SiteNav />
        <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-5 py-16">
          <p className="text-sm text-bone/70">Vous êtes déjà connecté. Redirection…</p>
        </main>
      </>
    );
  }

  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  return (
    <>
      <SiteNav />
      <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-5 py-16">
        <h1 className="font-display text-2xl text-bone">Connexion</h1>

        {/* Google Sign-In */}
        {googleClientId && (
          <div className="mt-6 flex flex-col items-center gap-3">
            <div id="google-signin-btn" />
            <div className="relative flex w-full items-center gap-3">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-xs text-bone/40">ou</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-navy-mid px-3 py-2.5 text-sm text-bone outline-none focus:border-gold"
          />
          <input
            type="password"
            required
            placeholder="Mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-navy-mid px-3 py-2.5 text-sm text-bone outline-none focus:border-gold"
          />
          <div className="flex justify-end">
            <Link href="/forgot-password" className="text-xs text-bone/50 hover:text-gold">
              Mot de passe oublié ?
            </Link>
          </div>
          {error && <p className="text-sm text-coral">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full bg-gold px-6 py-2.5 text-sm font-semibold text-navy-deep hover:bg-gold-soft disabled:opacity-60"
          >
            {submitting ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>
        <p className="mt-6 text-sm text-bone/50">
          Pas encore de compte ?{' '}
          <Link href="/register" className="text-gold hover:underline">
            Inscrivez-vous
          </Link>
        </p>
      </main>
    </>
  );
}
