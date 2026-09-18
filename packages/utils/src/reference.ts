/**
 * Génère `byteLength` octets aléatoires cryptographiquement sûr via Web
 * Crypto (getRandomValues). Utilisé à la place de `node:crypto` pour qu'un
 * bundle client (Next.js) qui importe @gm/utils ne bute pas sur le schéma
 * `node:` — Web Crypto est dispo en navigateur ET en Node >= 20.
 */
function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

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
  const randomPart = randomHex(3).toUpperCase();
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
  const suffix = randomHex(2).toUpperCase();
  return `${base || 'AFF'}${suffix}`;
}
