'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { registerSchema } from '@gm/validation';
import { apiFetch } from '@/lib/api-client';
import { getOrCreateTrackingSessionId } from '@/lib/tracking-session';
import { notifyAuthChanged, useCurrentUser } from '@/lib/use-current-user';
import { SiteNav } from '@/components/site-nav';
import { validateForm, type FieldErrors } from '@/lib/form-validation';

const COUNTRIES = [{ code: 'SN', name: 'Sénégal' }];

declare global {
  interface Window {
    google?: { accounts: { id: { initialize: (config: Record<string, unknown>) => void; renderButton: (el: HTMLElement, config: Record<string, unknown>) => void; prompt: () => void } } };
  }
}

export default function RegisterPage() {
  const router = useRouter();
  const { user, loading } = useCurrentUser();
  const [form, setForm] = useState({
    email: '',
    phone: '',
    password: '',
    firstName: '',
    lastName: '',
    username: '',
    country: 'SN',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loadingSubmit, setLoadingSubmit] = useState(false);

  // Rediriger si déjà connecté
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

    const btnEl = document.getElementById('google-register-btn');
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
    setErrors({});
    setLoadingSubmit(true);
    try {
      await apiFetch('/api/v1/auth/google', {
        method: 'POST',
        json: { idToken: response.credential, sessionId: getOrCreateTrackingSessionId() },
      });
      notifyAuthChanged();
      router.push('/marketplace');
      router.refresh();
    } catch (err) {
      setErrors({ _form: err instanceof Error ? err.message : 'Erreur d\'inscription Google' });
    } finally {
      setLoadingSubmit(false);
    }
  }

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

    const parsed = validateForm(registerSchema, {
      ...form,
      phone: form.phone.trim() === '' ? undefined : form.phone.trim(),
      sessionId: getOrCreateTrackingSessionId(),
    });

    if (parsed.errors) {
      setErrors(parsed.errors);
      return;
    }

    setLoadingSubmit(true);
    try {
      await apiFetch('/api/v1/auth/register', {
        method: 'POST',
        json: parsed.data,
      });
      notifyAuthChanged();
      router.push('/marketplace');
      router.refresh();
    } catch (err) {
      setErrors({
        _form: err instanceof Error ? err.message : "Erreur lors de l'inscription",
      });
    } finally {
      setLoadingSubmit(false);
    }
  }

  const inputClass =
    'w-full rounded-lg border border-white/10 bg-navy-mid px-3 py-2.5 text-sm text-bone outline-none focus:border-gold';

  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  return (
    <>
      <SiteNav />
      <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-5 py-16">
        <h1 className="font-display text-2xl text-bone">Créer un compte</h1>

        {/* Google Sign-Up */}
        {googleClientId && (
          <div className="mt-6 flex flex-col items-center gap-3">
            <div id="google-register-btn" />
            <div className="relative flex w-full items-center gap-3">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-xs text-bone/40">ou</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4" noValidate>
          {errors._form && <p className="text-sm text-coral">{errors._form}</p>}
          {errors.sessionId && <p className="text-sm text-coral">{errors.sessionId}</p>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <input
                required
                placeholder="Prénom"
                value={form.firstName}
                onChange={(e) => update('firstName', e.target.value)}
                className={inputClass}
              />
              {errors.firstName && (
                <p className="mt-1 text-xs text-coral">{errors.firstName}</p>
              )}
            </div>
            <div>
              <input
                required
                placeholder="Nom"
                value={form.lastName}
                onChange={(e) => update('lastName', e.target.value)}
                className={inputClass}
              />
              {errors.lastName && (
                <p className="mt-1 text-xs text-coral">{errors.lastName}</p>
              )}
            </div>
          </div>

          <div>
            <input
              required
              placeholder="Nom d'utilisateur (minuscules, chiffres, _)"
              value={form.username}
              onChange={(e) => update('username', e.target.value.toLowerCase())}
              className={inputClass}
            />
            {errors.username && (
              <p className="mt-1 text-xs text-coral">{errors.username}</p>
            )}
          </div>

          <div>
            <input
              type="email"
              required
              placeholder="Email"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              className={inputClass}
            />
            {errors.email && <p className="mt-1 text-xs text-coral">{errors.email}</p>}
          </div>

          <div>
            <input
              type="tel"
              placeholder="Téléphone (optionnel)"
              value={form.phone}
              onChange={(e) => update('phone', e.target.value)}
              className={inputClass}
            />
            {errors.phone && <p className="mt-1 text-xs text-coral">{errors.phone}</p>}
          </div>

          <div>
            <input
              type="password"
              required
              placeholder="Mot de passe"
              value={form.password}
              onChange={(e) => update('password', e.target.value)}
              className={inputClass}
            />
            {errors.password ? (
              <p className="mt-1 text-xs text-coral">{errors.password}</p>
            ) : (
              <p className="mt-1 text-xs text-bone/40">
                10 caractères minimum, avec au moins une majuscule et un chiffre.
              </p>
            )}
          </div>

          <select
            value={form.country}
            onChange={(e) => update('country', e.target.value)}
            className={inputClass}
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>

          <button
            type="submit"
            disabled={loadingSubmit}
            className="w-full rounded-full bg-gold px-6 py-2.5 text-sm font-semibold text-navy-deep hover:bg-gold-soft disabled:opacity-60"
          >
            {loadingSubmit ? 'Création…' : 'Créer mon compte'}
          </button>
        </form>
        <p className="mt-6 text-sm text-bone/50">
          Déjà un compte ?{' '}
          <Link href="/login" className="text-gold hover:underline">
            Connectez-vous
          </Link>
        </p>
      </main>
    </>
  );
}
