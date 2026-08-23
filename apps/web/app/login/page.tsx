'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { notifyAuthChanged, useCurrentUser } from '@/lib/use-current-user';
import { SiteNav } from '@/components/site-nav';

export default function LoginPage() {
  const router = useRouter();
  const { user, loading } = useCurrentUser();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Un utilisateur déjà connecté n'a rien à faire ici : on le renvoie vers la
  // marketplace au lieu de lui permettre de se connecter à un autre compte.
  useEffect(() => {
    if (!loading && user) {
      router.replace('/marketplace');
    }
  }, [loading, user, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await apiFetch('/api/v1/auth/login', { method: 'POST', json: { email, password } });
      // Le header (SiteNav) est déjà monté : on le notifie pour qu'il affiche
      // immédiatement l'état connecté.
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

  return (
    <>
      <SiteNav />
      <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-5 py-16">
        <h1 className="font-display text-2xl text-bone">Connexion</h1>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
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
