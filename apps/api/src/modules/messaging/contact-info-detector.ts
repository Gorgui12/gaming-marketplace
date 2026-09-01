/**
 * Détection de tentative de partage de coordonnées / contournement de la
 * plateforme (§15) — numéro de téléphone, email, lien externe. Signale
 * seulement (flaggedForContactInfo = true, visible en modération), ne
 * bloque JAMAIS l'envoi au MVP, comme demandé par le cahier des charges
 * initial ("Ne bloque pas agressivement dès le MVP : commence avec
 * modération et signalement").
 */
const PHONE_PATTERN = /(\+?\d[\s.-]?){8,}/;
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const URL_PATTERN = /(https?:\/\/|www\.)[^\s]+/i;
// Réseaux/messageries fréquemment utilisés pour contourner la plateforme.
const EXTERNAL_CONTACT_KEYWORDS = /\b(whatsapp|telegram|wa\.me|snapchat|instagram)\b/i;

export function detectContactInfoSharing(content: string): boolean {
  return (
    PHONE_PATTERN.test(content) ||
    EMAIL_PATTERN.test(content) ||
    URL_PATTERN.test(content) ||
    EXTERNAL_CONTACT_KEYWORDS.test(content)
  );
}
