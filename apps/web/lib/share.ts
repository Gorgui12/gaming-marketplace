/**
 * Primitives de partage — aucun état React, uniquement de la construction
 * d'URL et de texte.
 *
 * L'enjeu est double :
 *
 * 1. Ne contenir que le lien public. La messagerie de la plateforme bloque
 *    les messages contenant des coordonnées (`contact-info-detector` interdit
 *    whatsapp, telegram, wa.me, ...), et surtout le vendeur ne doit pas pouvoir
 *    détourner l'acheteur hors du séquestre en partageant son numéro à côté
 *    de l'annonce. Le message contient donc l'URL et rien d'autre.
 * 2. Réutiliser ce que le programme d'affiliation fait déjà à la main
 *    (`affiliate-dashboard.tsx`), pour ne pas avoir deux implémentations
 *    divergentes des URLs de partage.
 */

import { SHARE_CHANNELS, type ShareChannel } from '@gm/types';
import { listingPath } from './seo';

// Réexportés depuis @gm/types : la liste des canaux vit dans le package
// partagé, sinon le front proposerait un canal que l'API refuse, ou
// l'inverse. Ici on ne fait que la relayer pour que les composants
// n'aient qu'un module à importer.
export { SHARE_CHANNELS };
export type { ShareChannel };

export interface ListingShareInfo {
  slug: string;
  title: string;
  price: number;
  currency: string;
  gameSlug?: string;
}

/** Chemin relatif de l'annonce à publier. */
export function listingSharePath(info: ListingShareInfo): string {
  return listingPath(info.slug, info.gameSlug);
}

export function formatSharePrice(price: number, currency: string): string {
  return `${price.toLocaleString('fr-FR')} ${currency}`;
}

/**
 * Message pré-rempli.
 *
 * Volontairement court et centré sur ce qui convainc au Sénégal : le prix et
 * la protection par séquestre Mobile Money, qui est la vraie barrière à
 * l'entrée face aux ventes hors plateforme. Pas de lien tracking, pas de
 * emoji en excès — un message que le vendeur n'a pas à réécrire.
 */
export function listingShareMessage(info: ListingShareInfo, link: string): string {
  return [
    `🎮 ${info.title}`,
    `💰 ${formatSharePrice(info.price, info.currency)}`,
    '',
    'Paiement bloqué en séquestre (Orange Money / Wave) : le vendeur est payé',
    'seulement après votre confirmation.',
    '',
    `👉 ${link}`,
  ].join('\n');
}

export function whatsappShareUrl(message: string): string {
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
}

/**
 * `quote` n'est pas honoré par le dialog de partage Facebook — le texte
 * part dans le champ de commentaire, pas dans le post. On garde le paramètre
 * car Facebook le propose sur mobile, et le lien seul reste acceptable sur
 * desktop.
 */
export function facebookShareUrl(message: string, link: string): string {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}&quote=${encodeURIComponent(message)}`;
}

/**
 * Feuille de partage native du système (iOS, Android, et Safari/Firefox
 * recent sur desktop). C'est le seul moyen d'exposer Telegram, X ou SMS sans
 * écrire un bouton par réseau — et donc sans maintenir une liste qui devient
 * fausse au premier déploiement système.
 */
export function canNativeShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

export interface NativeSharePayload {
  title: string;
  text: string;
  url: string;
}

/** `AbortError` = l'utilisateur a refermé la feuille : ce n'est pas une erreur. */
export function isShareAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
