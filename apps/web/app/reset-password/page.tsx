'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { notifyAuthChanged } from '@/lib/use-current-user';
import { SiteNav } from '@/components/site-nav';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!token) {
    return (
      <>
        <SiteNav />
        <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-5 py-16">
          <p className="text-sm text-coral">Lien de réinitialisation invalide.</p>
          <Link href="/forgot-password" className="mt-4 text-sm text-gold hover:underline">
            Demander un nouveau lien
          </Link>
        </main>
      </>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }

    setLoading(true);
    try {
      await apiFetch('/api/v1/auth/reset-password', {
        method: 'POST',
        json: { token, password },
      });
      notifyAuthChanged();
      router.push('/marketplace');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la réinitialisation');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <SiteNav />
      <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-5 py-16">
        <h1 className="font-display text-2xl text-bone">Nouveau mot de passe</h1>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {error && <p className="text-sm text-coral">{error}</p>}
          <input
            type="password"
            required
            placeholder="Nouveau mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-navy-mid px-3 py-2.5 text-sm text-bone outline-none focus:border-gold"
          />
          <input
            type="password"
            required
            placeholder="Confirmer le mot de passe"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-navy-mid px-3 py-2.5 text-sm text-bone outline-none focus:border-gold"
          />
          <p className="text-xs text-bone/40">
            10 caractères minimum, avec au moins une majuscule et un chiffre.
          </p>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-gold px-6 py-2.5 text-sm font-semibold text-navy-deep hover:bg-gold-soft disabled:opacity-60"
          >
            {loading ? 'Réinitialisation…' : 'Réinitialiser le mot de passe'}
          </button>
        </form>
      </main>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
