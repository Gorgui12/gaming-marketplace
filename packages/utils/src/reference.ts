import { randomBytes } from 'node:crypto';

/**
 * Génère une référence de paiement interne unique et lisible.
 * Format: GM-<timestamp base36>-<random hex 6>
 * Cette référence est celle envoyée à PayDunya (comme `internal_reference`
 * en custom_data) et utilisée comme clé d'idempotence métier côté
 * plateforme (distincte du providerEventId du webhook, qui garantit
 * l'idempotence côté réception).
 */
export function generatePaymentReference(): string {
  const timePart = Date.now().toString(36).toUpperCase();
  const randomPart = randomBytes(3).toString('hex').toUpperCase();
  return `GM-${timePart}-${randomPart}`;
}

/**
 * Génère un code affilié lisible à partir du nom d'affichage souhaité
 * (ex: "Gorgui Gaming" -> "GORGUIGAMING1A2B"). Suffixe aléatoire pour
 * garantir l'unicité même si deux affiliés choisissent un nom proche —
 * l'appelant doit quand même vérifier l'unicité en base avant insertion.
 */
export function generateAffiliateCode(displayName: string): string {
  const base = displayName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 16);
  const suffix = randomBytes(2).toString('hex').toUpperCase();
  return `${base || 'AFF'}${suffix}`;
}
