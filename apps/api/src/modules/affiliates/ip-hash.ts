import { createHash } from 'node:crypto';
import { env } from '../../config/env.js';

/**
 * Hash non réversible d'une IP, salé avec SESSION_SECRET pour éviter la
 * corrélation directe avec des bases externes. Utilisé uniquement pour de
 * l'anti-fraude (débit de clics anormal depuis une même origine), jamais
 * pour de l'identification individuelle (§5/§30 minimisation des données).
 */
export function hashIp(ip: string): string {
  return createHash('sha256').update(`${ip}:${env.SESSION_SECRET}`).digest('hex').slice(0, 32);
}
