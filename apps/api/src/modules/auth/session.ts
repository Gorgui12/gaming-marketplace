import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';

export interface SessionPayload {
  userId: string;
  roles: string[];
  issuedAt: number;
  /**
   * Valeur de `user.sessionVersion` au moment de l'émission. Permet de
   * révoquer les cookies déjà distribués : il suffit d'incrémenter le
   * champ en base (bannissement, changement de rôle, changement de mot de
   * passe) pour que les anciens tokens ne passent plus `attachUser`.
   * Absent des tokens émis avant ce champ : traité comme 0, donc valide
   * uniquement si l'utilisateur est toujours à 0.
   */
  sessionVersion?: number;
}

function sign(payload: string): string {
  return createHmac('sha256', env.SESSION_SECRET).update(payload).digest('base64url');
}

export function createSessionToken(
  userId: string,
  roles: string[],
  sessionVersion = 0,
): string {
  const payload: SessionPayload = { userId, roles, issuedAt: Date.now(), sessionVersion };
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = sign(payloadStr);
  return `${payloadStr}.${signature}`;
}

export function verifySessionToken(
  token: string,
): { userId: string; roles: string[]; sessionVersion: number } | null {
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
    return {
      userId: payload.userId,
      roles: payload.roles,
      sessionVersion: payload.sessionVersion ?? 0,
    };
  } catch {
    return null;
  }
}
