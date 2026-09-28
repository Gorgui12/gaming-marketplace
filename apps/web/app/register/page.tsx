'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Script from 'next/script';
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
    // Décochée par défaut, volontairement : une case pré-cochée ne vaut pas
    // consentement. Le GDPR comme la CNDP considers qu'un consentement
    // présumé est un consentement invalide, et c'est ce que sanctionne le
    // premier audit.
    marketingOptIn: false,
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loadingSubmit, setLoadingSubmit] = useState(false);
  // Diagnostic de l'adresse saisi, demandé à l'API à la sortie du champ
  // (et non à chaque frappe) : c'est le seul moment où le domaine est connu
  // et où l'utilisateur n'attend pas encore de réponse.
  const [emailHint, setEmailHint] = useState<{
    suggestion: string | null;
    deliverable: boolean | null;
  }>({ suggestion: null, deliverable: null });

  // `value` est typé d'après la clé : `marketingOptIn` est un booléen, pas une
  // chaîne, et un `value: string` forcerait un cast mensonger à l'appel.
  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key === 'email') {
      setEmailHint({ suggestion: null, deliverable: null });
    }
  }

  async function checkEmailField() {
    const email = form.email.trim();
    if (!email || !email.includes('@')) return;
    try {
      const res = await apiFetch<{
        suggestion: string | null;
        deliverable: boolean | null;
      }>('/api/v1/auth/check-email', { method: 'POST', json: { email } });
      setEmailHint({ suggestion: res.suggestion, deliverable: res.deliverable });
    } catch {
      // Diagnostic non bloquant : un échec ici ne doit pas empêcher
      // l'inscription, le serveur refait le contrôle de toute façon.
    }
  }

  // Rediriger si déjà connecté
  useEffect(() => {
    if (!loading && user) {
      router.replace('/marketplace');
    }
  }, [loading, user, router]);

  // Charger Google Identity Services
  const [googleReady, setGoogleReady] = useState(false);

  function initGoogleSignUp() {
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
  }

  useEffect(() => {
    if (googleReady) {
      initGoogleSignUp();
    }
  }, [googleReady]);

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
      router.push('/verify-email');
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur lors de l'inscription";
      // Le refus de délivrabilité concerne l'email : on l'affiche sous le
      // champ plutôt qu'en message global, sinon l'utilisateur ne sait pas
      // quoi corriger.
      if (message.includes('domaine ne peut pas')) {
        setErrors({ email: message });
      } else {
        setErrors({ _form: message });
      }
    } finally {
      setLoadingSubmit(false);
    }
  }

  const inputClass =
    'w-full rounded-lg border border-white/10 bg-navy-mid px-3 py-2.5 text-sm text-bone outline-none focus:border-gold';

  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={() => setGoogleReady(true)}
      />
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
              onBlur={checkEmailField}
              className={inputClass}
            />
            {errors.email ? (
              <p className="mt-1 text-xs text-coral">{errors.email}</p>
            ) : emailHint.deliverable === false ? (
              <p className="mt-1 text-xs text-coral">
                Ce domaine ne semble pas pouvoir recevoir d'email. Vérifiez
                l'adresse saisie.
              </p>
            ) : emailHint.suggestion ? (
              <p className="mt-1 text-xs text-gold">
                Vous vouliez dire{' '}
                <button
                  type="button"
                  onClick={() => {
                    update('email', emailHint.suggestion!);
                    setEmailHint({ suggestion: null, deliverable: null });
                  }}
                  className="underline hover:text-gold-soft"
                >
                  {emailHint.suggestion}
                </button>{' '}
                ?
              </p>
            ) : null}
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

          <label className="flex cursor-pointer items-start gap-2.5 text-xs text-bone/60">
            <input
              type="checkbox"
              checked={form.marketingOptIn}
              onChange={(e) => update('marketingOptIn', e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-gold"
            />
            <span>
              Recevoir la newsletter : les 5 comptes les plus consultés sur la
              marketplace, une fois par semaine. Désinscription en un clic depuis
              n&apos;importe quel email.
            </span>
          </label>

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
