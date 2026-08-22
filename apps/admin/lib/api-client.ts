import type { ApiResponse } from '@gm/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function apiFetch<T>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const { json, headers, ...rest } = init ?? {};
  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    credentials: 'include',
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    cache: 'no-store',
  });

  const body = (await res.json().catch(() => null)) as ApiResponse<T> | null;

  if (!res.ok || !body || body.success === false) {
    const message =
      body && body.success === false ? body.error.message : `Erreur API (${res.status})`;
    throw new Error(message);
  }

  return body.data;
}
