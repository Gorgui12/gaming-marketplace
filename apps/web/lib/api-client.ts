import type { ApiResponse } from '@gm/types';

// Base relative : les requêtes partent vers /backend/* (même origine) et
// Next.js les proxifie vers l'API (rewrite dans next.config.ts, cible
// configurée par la variable d'environnement serveur API_URL). Indispensable
// pour que le cookie de session soit first-party — Safari iOS bloque les
// cookies tiers posés par un fetch cross-site.
// Côté serveur (SSR/ISR : marketplace, détail annonce…), une URL relative
// n'est pas résoluble par fetch → on appelle l'API directement.
const API_BASE =
  typeof window === 'undefined'
    ? (process.env.API_URL ?? 'http://localhost:4000')
    : '/backend';

const API_TIMEOUT_MS = 15000;

/**
 * Erreur renvoyée par l'API quand le compte n'a pas encore confirmé son email
 * et tente une action engageante (publier une annonce, acheter, envoyer un
 * message, poster un avis, modifier son profil).
 *
 * Portée volontairement large : le garde-fou est posé côté API, donc n'importe
 * quelle page peut le déclencher. Plutôt que de traiter le cas dans chaque
 * écran appelant, `apiFetch` redirige vers la page de confirmation — c'est le
 * seul endroit où l'utilisateur peut corriger le problème.
 */
export class EmailNotVerifiedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailNotVerifiedError';
  }
}

function isEmailNotVerified(body: ApiResponse<unknown> | null): boolean {
  return (
    !!body &&
    body.success === false &&
    body.error.code === 'EMAIL_NOT_VERIFIED'
  );
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const { json, headers, signal, ...rest } = init ?? {};
  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    // Évite que le build Vercel (génération statique/ISR) pende indéfiniment
    // si l'API est injoignable ou endormie (free tier).
    signal: signal ?? AbortSignal.timeout(API_TIMEOUT_MS),
    headers: {
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    credentials: 'include',
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });

  const body = (await res.json().catch(() => null)) as ApiResponse<T> | null;

  if (!res.ok || !body || body.success === false) {
    if (body && body.success === false) {
      // Cas particulier du garde-fou email : plutôt que d'afficher une erreur
      // morte dans une modale, on emmène l'utilisateur là où il peut agir.
      if (isEmailNotVerified(body)) {
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/verify-email')) {
          window.location.assign('/verify-email');
        }
        throw new EmailNotVerifiedError(body.error.message);
      }
      const details = body.error.details as
        | { fieldErrors?: Record<string, string[]>; formErrors?: string[] }
        | undefined;
      const fieldMessages = details?.fieldErrors
        ? Object.entries(details.fieldErrors)
            .filter(([, msgs]) => msgs && msgs.length > 0)
            .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
            .join(' | ')
        : '';
      throw new Error(fieldMessages ? `${body.error.message} — ${fieldMessages}` : body.error.message);
    }
    throw new Error(`Erreur API (${res.status})`);
  }

  return body.data;
}