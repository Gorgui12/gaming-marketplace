import type { ApiResponse } from '@gm/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const API_TIMEOUT_MS = 8000;

export async function apiFetch<T>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const { json, headers, signal, ...rest } = init ?? {};
  const res = await fetch(`${API_URL}${path}`, {
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