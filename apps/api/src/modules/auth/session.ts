import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';

export interface SessionPayload {
  userId: string;
  roles: string[];
  issuedAt: number;
}

/**
 * Implémentation simple signée HMAC pour la Phase 1. Suffisant pour démarrer
 * le développement; à réévaluer en Phase 2 (voir docs/SECURITY.md) pour la
 * révocation immédiate — un store de session en base (ou Redis) permettrait
 * une invalidation instantanée, ce qu'un token purement signé ne permet pas
 * sans rotation de secret globale.
 */
function sign(payload: string): string {
  return createHmac('sha256', env.SESSION_SECRET).update(payload).digest('base64url');
}

export function createSessionToken(userId: string, roles: string[]): string {
  const payload: SessionPayload = { userId, roles, issuedAt: Date.now() };
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = sign(payloadStr);
  return `${payloadStr}.${signature}`;
}

export function verifySessionToken(
  token: string,
): { userId: string; roles: string[] } | null {
  const [payloadStr, signature] = token.split('.');
  if (!payloadStr || !signature) return null;

  const expectedSignature = sign(payloadStr);
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf8')) as SessionPayload;
    const maxAgeMs = env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
    if (Date.now() - payload.issuedAt > maxAgeMs) return null;
    return { userId: payload.userId, roles: payload.roles };
  } catch {
    return null;
  }
}
