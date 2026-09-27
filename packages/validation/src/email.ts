import { z } from 'zod';

/**
 * Analyse STRUCTURELLE d'une adresse email. Aucun appel réseau ici : ce
 * module est partagé entre le navigateur (retour immédiat sous le champ) et
 * l'API, et doit rester déterministe. La vérification de délivrabilité réelle
 * (MX) est côté serveur uniquement — voir apps/api/src/lib/email/.
 */

/** RFC 5321 : 64 octets pour la partie locale, 254 pour l'adresse entière. */
export const EMAIL_MAX_LENGTH = 254;
const LOCAL_PART_MAX_LENGTH = 64;

const EMAIL_REGEX = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;

/**
 * Domaines jetables : la boîte disparaît, aucun mot de confirmation n'y
 * parviendra jamais. Le compte serait bloqué à vie. Liste volontairement
 * limitée aux services les plus connus — c'est un filtre, pas une référence
 * exhaustive (et de toute façon la confirmation par email reste la preuve
 * qui fait foi).
 */
export const DISPOSABLE_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  '10minutemail.com',
  '20minutemail.com',
  'dispostable.com',
  'emailondeck.com',
  'fakeinbox.com',
  'getnada.com',
  'grr.la',
  'guerrillamail.com',
  'guerrillamailblock.com',
  'maildrop.cc',
  'mailinator.com',
  'mintemail.com',
  'moakt.com',
  'mytemp.email',
  'sharklasers.com',
  'spamgourmet.com',
  'temp-mail.org',
  'tempmail.com',
  'throwawaymail.com',
  'trashmail.com',
  'yopmail.com',
]);

/**
 * Fournisseurs courants, pour la détection de fautes de frappe. Volontairement
 * restreint aux grands comptes grand public : c'est là que l'utilisateur se
 * trompe (`.con`, `gmial`, `hotmial`) et où la suggestion est fiable.
 */
export const POPULAR_EMAIL_DOMAINS: readonly string[] = [
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.fr',
  'yahoo.co.uk',
  'ymail.com',
  'hotmail.com',
  'hotmail.fr',
  'hotmail.co.uk',
  'outlook.com',
  'outlook.fr',
  'live.fr',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'protonmail.com',
  'proton.me',
  'pm.me',
  'aol.com',
  'gmx.com',
  'gmx.de',
  'gmx.net',
  'mail.com',
  'mail.ru',
  'yandex.com',
  'yandex.ru',
  'zoho.com',
  'orange.fr',
  'free.fr',
  'laposte.net',
  'sfr.fr',
  'wanadoo.fr',
  'bbox.fr',
  'numericable.fr',
  'club-internet.fr',
  'aliceadsl.fr',
  't-online.de',
  'libero.it',
  'virgilio.it',
  'terra.com.br',
  'uol.com.br',
  'bol.com.br',
  'qq.com',
  '163.com',
  '126.com',
  'sina.com',
  'naver.com',
  'daum.net',
  'web.de',
];

/** TLDs réservés (RFC 2606 / 6761) : aucun domaine public ne peut les porter. */
const RESERVED_TLDS: ReadonlySet<string> = new Set([
  'test',
  'invalid',
  'example',
  'localhost',
  'local',
]);

/** Distance de Levenshtein classique, deux lignes de mémoire vive. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        (curr[j - 1] ?? 0) + 1,
        (prev[j] ?? 0) + 1,
        (prev[j - 1] ?? 0) + cost,
      );
    }
    prev = [...curr];
  }
  return prev[b.length] ?? 0;
}

/** Découpe une adresse en ses deux moitiés, ou null si la forme est invalide. */
function splitEmail(email: string): { local: string; domain: string } | null {
  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) return null;
  return { local: email.slice(0, at), domain: email.slice(at + 1).toLowerCase() };
}

export interface EmailAnalysis {
  /** Réfus définitif : le compte ne peut pas être créé. */
  problem: string | null;
  /**
   * Domaine probablement voulu. Uniquement un indice : l'adresse reste
   * acceptée, on se contente de proposer la correction. Bloquer sur une
   * heuristique prendrait au piège les domaines légitimes et proches.
   */
  suggestion: string | null;
}

/**
 * Analyse une adresse et renvoie soit un refus, soit une suggestion de
 * correction. Ne lève jamais.
 */
export function analyseEmail(email: string): EmailAnalysis {
  const trimmed = email.trim();
  const parts = splitEmail(trimmed);

  if (!parts || !EMAIL_REGEX.test(trimmed)) {
    return { problem: 'Adresse email invalide', suggestion: null };
  }

  const { local, domain } = parts;

  if (trimmed.length > EMAIL_MAX_LENGTH || local.length > LOCAL_PART_MAX_LENGTH) {
    return { problem: 'Adresse email trop longue', suggestion: null };
  }

  const tld = domain.split('.').pop() ?? '';
  if (RESERVED_TLDS.has(tld)) {
    return {
      problem: `« .${tld} » n'est pas un vrai domaine public`,
      suggestion: null,
    };
  }

  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
    return {
      problem: 'Les adresses jetables ne sont pas acceptées : votre email ne sera jamais reçu',
      suggestion: null,
    };
  }

  // Indice de correction, jamais un refus.
  let suggestion: string | null = null;
  if (!POPULAR_EMAIL_DOMAINS.includes(domain)) {
    // TLD d'abord : « .con » et « .cmo » sont des fautes très fréquentes et
    // la correction est évidente.
    if (tld === 'con' || tld === 'cmo' || tld === 'comm') {
      suggestion = `${local}@${domain.slice(0, -(tld.length + 1))}.com`;
    } else {
      // Sinon, un domaine voisin parmi les fournisseurs connus.
      let best: { domain: string; distance: number } | null = null;
      for (const known of POPULAR_EMAIL_DOMAINS) {
        const distance = levenshtein(domain, known);
        if (distance === 0) continue;
        // Fenêtre proportionnelle à la longueur : 1 faute sur un domaine
        // court, 2 sur un plus long. Au-delà, ce serait du bruit.
        const maxDistance = domain.length <= 8 ? 1 : 2;
        if (distance > maxDistance) continue;
        if (!best || distance < best.distance) best = { domain: known, distance };
      }
      if (best) suggestion = `${local}@${best.domain}`;
    }
  }

  return { problem: null, suggestion };
}

/**
 * Champ email pour un formulaire public : rejette ce qui ne peut pas
 * fonctionner (format, TLD réservé, domaine jetable) et signale les
 * corrections probables. Le message d'erreur d'un champ invalide est remonté
 * tel quel par `validateForm` côté web, d'où `superRefine` : il permet
 * d'attacher le motif précis (« domaine jetable ») plutôt qu'un « adresse
 * invalide » générique. `refine` ne le permet pas — une refinement qui
 * renvoie un objet est truthy, donc acceptée.
 */
export const emailFieldSchema = z
  .string()
  .trim()
  .max(EMAIL_MAX_LENGTH, 'Adresse email trop longue')
  .superRefine((value, ctx) => {
    const { problem } = analyseEmail(value);
    if (problem !== null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
    }
  });
