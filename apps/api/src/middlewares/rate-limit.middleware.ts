import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

export const globalRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limit spécifique et plus strict pour les routes sensibles au
 * brute-force (login) — volontairement séparé du rate limit global.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Trop de tentatives, réessayez plus tard' },
  },
});

/**
 * Rate limit du renvoi du lien de confirmation.
 *
 * Volontairement plus strict que `authRateLimiter` : cette route envoie un
 * email VERS une adresse fournie par l'appelant, donc elle peut servir à
 * harceler la boîte d'un tiers. 3 tentatives par quart d'heure laisse le cas
 * légitime (« mon email est en spam ») très comfortably au-dessus du besoin.
 */
export const emailResendRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Trop de demandes de renvoi. Réessayez dans quelques minutes.',
    },
  },
});

/**
 * Rate limit du diagnostic d'email avant inscription.
 *
 * Limiteur SÉPARÉ de `authRateLimiter` : ce dernier est partagé avec login et
 * register, et or le diagnostic se déclenche à la sortie du champ email. Sans
 * ce bucket dédié, taper trois fois dans le champ puis essayer de s'inscrire
 * ferait tomber l'inscription dans le quota du login.
 */
export const emailCheckRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Trop de vérifications d\'adresse. Réessayez plus tard.' },
  },
});

/**
 * Rate limit dédié aux webhooks entrants — plus permissif car le provider
 * peut retenter légitimement, mais protège contre un flood malveillant.
 */
export const webhookRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limit du signalement de partage d'annonce.
 *
 * Route publique, donc la seule chose qui relie l'appelant à sa bonne foi est
 * son IP. La déduplication par session de tracking empêche déjà de gonfler le
 * compteur en recliquant, mais elle est contournable en vidant les cookies : ce
 * limiteur ferme la seconde porte, en bornant le nombre de sessions distinctes
 * qu'une même IP peut faire naître en une heure.
 *
 * 30 par heure : très au-dessus du vendeur qui envoie son annonce dans une
 * dizaine de groupes, et très en dessous de ce qu'un script pourrait faire pour
 * afficher un chiffre flatuleux sur sa fiche.
 */
export const listingShareRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Trop de partages signalés. Réessayez plus tard.' },
  },
});

/**
 * Rate limit d'ouverture de litige.
 *
 * 5 par heure : assez pour un acheteur qui se trompe de transaction ou
 * qui complète son dossier sur plusieurs jours, bien trop peu pour qu'un
 * script ouvre des dizaines de litiges et inonde les boîtes mail du vendeur
 * et des administrateurs (chaque ouverture déclenche 2 emails et 2
 * notifications in-app).
 */
export const disputeRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Trop de demandes de litige. Réessayez plus tard.',
    },
  },
});
