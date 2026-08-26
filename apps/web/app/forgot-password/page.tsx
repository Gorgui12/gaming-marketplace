'use client';

import { useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { SiteNav } from '@/components/site-nav';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await apiFetch('/api/v1/auth/forgot-password', {
        method: 'POST',
        json: { email },
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'envoi');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <SiteNav />
      <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-5 py-16">
        <h1 className="font-display text-2xl text-bone">Mot de passe oublié</h1>

        {submitted ? (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-bone/70">
              Si un compte existe avec cette adresse email, vous recevrez un lien de réinitialisation
              dans quelques instants. Vérifiez votre boîte de réception et vos spams.
            </p>
            <Link href="/login" className="inline-block text-sm text-gold hover:underline">
              Retour à la connexion
            </Link>
          </div>
        ) : (
          <>
            <p className="mt-2 text-sm text-bone/50">
              Entrez votre adresse email et nous vous enverrons un lien pour réinitialiser votre mot
              de passe.
            </p>
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {error && <p className="text-sm text-coral">{error}</p>}
              <input
                type="email"
                required
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-navy-mid px-3 py-2.5 text-sm text-bone outline-none focus:border-gold"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-full bg-gold px-6 py-2.5 text-sm font-semibold text-navy-deep hover:bg-gold-soft disabled:opacity-60"
              >
                {loading ? 'Envoi…' : 'Envoyer le lien'}
              </button>
            </form>
            <p className="mt-6 text-sm text-bone/50">
              <Link href="/login" className="text-gold hover:underline">
                Retour à la connexion
              </Link>
            </p>
          </>
        )}
      </main>
    </>
  );
}
