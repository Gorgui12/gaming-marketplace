'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await apiFetch('/api/v1/auth/login', { method: 'POST', json: { email, password } });
      router.push('/games');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de connexion');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <p className="mb-6 text-center font-display text-lg text-bone">
          GM<span className="text-gold">ADMIN</span>
        </p>
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-ticket border border-white/10 bg-navy-mid p-6"
        >
          <input
            type="email"
            required
            placeholder="Email admin"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-navy-deep px-3 py-2.5 text-sm text-bone outline-none focus:border-gold"
          />
          <input
            type="password"
            required
            placeholder="Mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-navy-deep px-3 py-2.5 text-sm text-bone outline-none focus:border-gold"
          />
          {error && <p className="text-sm text-coral">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-gold px-6 py-2.5 text-sm font-semibold text-navy-deep hover:bg-gold-soft disabled:opacity-60"
          >
            {loading ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-bone/40">
          Réservé aux comptes ADMIN / SUPER_ADMIN.
        </p>
      </div>
    </div>
  );
}
