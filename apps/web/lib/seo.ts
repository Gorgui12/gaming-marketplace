/**
 * Configuration SEO/GEO centrale. Le Sénégal est le marché prioritaire
 * (§ demande explicite) — toutes les métadonnées par défaut ciblent Dakar/
 * Sénégal en premier, avec extension progressive UEMOA prévue par
 * packages/config (countries.ts) mais pas encore de contenu localisé par
 * pays tant que le marché n'est pas lancé (voir COUNTRIES.launched).
 */

export const SITE_NAME = 'Gaming Market';
export const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export const GEO = {
  country: 'SN',
  region: 'SN-DK', // Dakar, code ISO 3166-2
  placename: 'Dakar, Sénégal',
  // Coordonnées approximatives de Dakar — utilisées uniquement pour le
  // signal géographique ICBM/geo.position, pas pour un point exact.
  latitude: 14.7167,
  longitude: -17.4677,
};

/**
 * Mots-clés cibles principaux — intentions de recherche réelles au Sénégal
 * pour ce type de produit (achat/vente de comptes gaming, paiement Mobile
 * Money local). Utilisé comme base pour les métadonnées, pas injecté tel
 * quel dans le HTML (le keyword stuffing nuit au SEO).
 */
export const CORE_KEYWORDS = [
  'compte eFootball Sénégal',
  'acheter compte eFootball Dakar',
  'vendre compte eFootball',
  'marketplace gaming Sénégal',
  'compte gaming paiement Orange Money',
  'compte gaming paiement Wave',
  'achat vente compte jeu vidéo Afrique de l\'Ouest',
];

export function absoluteUrl(path: string): string {
  return `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Slug de jeu par défaut des routes publiques d'annonce.
 *
 * L'application n'expose aujourd'hui qu'eFootball (`/marketplace/efootball/...`) :
 * c'est la seule route de détail qui existe, donc le seul slug de jeu qu'on
 * peut déduire du contexte sans peupler la relation `game`.
 */
export const DEFAULT_GAME_SLUG = 'efootball';

/**
 * Chemin public d'une annonce.
 *
 * Fonction canonique : ce chemin était recopié en dur dans la page de détail,
 * la carte d'annonce et le sitemap. Un lien de partage construit ailleurs avec
 * la mauvaise variante casserait silencieusement, puisque la page de detail
 * n'existe que pour eFootball.
 *
 * Limite connue : l'API renvoie `listing.game` comme ObjectId non peuplé, on ne
 * peut donc pas deduire le slug du jeu cote front. Le parametre `gameSlug` est
 * prevu pour le jour ou le routage multi-jeu arrive — il faudra alors le
 * transmettre depuis la route ou peupler le jeu.
 */
export function listingPath(
  listingSlug: string,
  gameSlug: string = DEFAULT_GAME_SLUG,
): string {
  return `/marketplace/${gameSlug}/${listingSlug}`;
}

/** URL absolue et partageable d'une annonce (Open Graph, WhatsApp, sitemap). */
export function listingUrl(
  listingSlug: string,
  gameSlug: string = DEFAULT_GAME_SLUG,
): string {
  return absoluteUrl(listingPath(listingSlug, gameSlug));
}

/**
 * JSON-LD Organization — identité de l'entreprise pour le knowledge graph,
 * avec areaServed explicitement centré Sénégal/UEMOA.
 */
export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: BASE_URL,
    areaServed: {
      '@type': 'Country',
      name: 'Sénégal',
    },
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Dakar',
      addressCountry: 'SN',
    },
  };
}

/**
 * JSON-LD WebSite avec SearchAction — permet à Google d'afficher une boîte
 * de recherche sitelinks pour les requêtes de marque.
 */
export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: BASE_URL,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${BASE_URL}/marketplace?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

export function faqJsonLd(items: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}

export function breadcrumbJsonLd(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.url),
    })),
  };
}

/**
 * JSON-LD Article — pour les pages du blog (§23, canal d'acquisition
 * organique).
 */
export function articleJsonLd(params: {
  title: string;
  description: string;
  slug: string;
  coverImage?: string;
  publishedAt?: string;
  updatedAt?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: params.title,
    description: params.description,
    image: params.coverImage,
    datePublished: params.publishedAt,
    dateModified: params.updatedAt ?? params.publishedAt,
    author: { '@type': 'Organization', name: SITE_NAME },
    publisher: { '@type': 'Organization', name: SITE_NAME },
    mainEntityOfPage: absoluteUrl(`/blog/${params.slug}`),
  };
}
