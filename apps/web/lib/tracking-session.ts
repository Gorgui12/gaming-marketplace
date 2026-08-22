'use client';

const COOKIE_NAME = 'gm_track_sid';
const COOKIE_MAX_AGE_DAYS = 90;

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]!) : null;
}

function writeCookie(name: string, value: string, maxAgeDays: number): void {
  const maxAge = maxAgeDays * 24 * 60 * 60;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; samesite=lax`;
}

/**
 * Identifiant de session anonyme, purement destiné au tracking
 * d'attribution affiliée (§5/§8) — distinct du cookie de session
 * d'authentification (gm_session, httpOnly, géré côté API). Celui-ci est
 * volontairement lisible en JS pour être envoyé au endpoint de tracking et
 * réutilisé au checkout/à l'inscription.
 */
export function getOrCreateTrackingSessionId(): string {
  const existing = readCookie(COOKIE_NAME);
  if (existing) return existing;
  const id = crypto.randomUUID();
  writeCookie(COOKIE_NAME, id, COOKIE_MAX_AGE_DAYS);
  return id;
}
