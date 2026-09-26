import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors/app-error.js';
import { ErrorCode } from '../lib/errors/error-codes.js';
import { corsAllowedOrigins, env } from '../config/env.js';

/**
 * Protection CSRF par vérification d'Origin.
 *
 * Pourquoi nécessaire : le cookie de session est `SameSite=None` (le site et
 * l'admin sont sur deux domaines distincts, `SameSite=Lax` supprimerait le
 * cookie sur les appels cross-origin de l'admin), et il est `HttpOnly` mais
 * rattaché automatiquement à toute requête — donc exactement le profil
 * exploitable par CSRF. Le middleware CORS ne sauve pas la donnee : il se
 * contente de ne pas renvoyer d'en-tête `Access-Control-Allow-Origin`, la
 * requête POST étant déjà partie et déjà exécutée côté serveur. Un
 * `<form method="POST" action="https://api/…/admin/db/reset">` sur un site
 * tiers suffit, sans préflight.
 *
 * Principe : un navigateur attache TOUJOURS un en-tête `Origin` aux requêtes
 * cross-origin utilisant une méthode dangereuse. Donc
 *  - `Origin` présent et hors liste blanche -> requête forgée -> 403 ;
 *  - `Origin` présent et dans la liste blanche -> requête légitime ;
 *  - `Origin` absent -> aucun navigateur n'a pu produire cette requête
 *    cross-site, donc c'est un client non-navigateur (curl, SSR serveur,
 *    mobile) qu'on laisse passer.
 *
 * Ce dernier point est ce qui permet de protéger l'API sans casser les
 * appels côté serveur des fronts Next.js, qui n'envoient pas d'Origin.
 */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Webhooks fournisseurs : appels serveur-à-serveur, sans Origin, et
 * authentifiés par signature/HMAC — pas par le cookie de session. Les
 * exclure est sans risque (le cookie de session n'est de toute façon pas
 lu par ces routes).
 */
const CSRF_EXEMPT_PATHS = new Set([
  '/api/v1/payments/paydunya/ipn',
  '/api/v1/payments/unitechpay/webhook',
]);

/**
 * Origines légitimes : la liste CORS, plus l'URL de l'API elle-même (un
 * appel same-origin depuis l'API porte cette origine) et `APP_URL` (le front
 * peut être servi sur une URL de secours).
 */
const allowedOrigins = new Set<string>(
  [...corsAllowedOrigins, env.API_PUBLIC_URL, env.APP_URL].flatMap((url) => {
    try {
      return [new URL(url).origin.toLowerCase()];
    } catch {
      // Une URL non parsable ne peut pas être une origine : on l'ignore
      // plutôt que de rejeter toute requête (et de casser l'API).
      return [];
    }
  }),
);

function originIsAllowed(origin: string): boolean {
  // Normalisation : l'en-tête Origin est déjà sérialisé en minuscules par
  // les navigateurs, mais on normalise l'entrée de la config et l'origine
  // reçue pour que `https://ADMIN.example.com` dans CORS_ALLOWED_ORIGINS ne
  // crée pas d'exclusion subtile.
  return allowedOrigins.has(origin.trim().toLowerCase());
}

export function csrfGuard(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  if (CSRF_EXEMPT_PATHS.has(req.path)) {
    next();
    return;
  }

  const origin = req.headers.origin;

  if (!origin) {
    // Pas d'Origin : client non-navigateur. Voir l'analyse ci-dessus — un
    // navigateur envoie toujours Origin sur une requête cross-site
    // dangereuse, donc l'absence de cet en-tête ne peut pas provenir d'une
    // attaque CSRF pilotée depuis un site tiers.
    next();
    return;
  }

  // La RFC 6454 autorise une liste d'origines pour certaines requêtes :
  // on prend la première, c'est l'origine qui a initie la requête.
  const candidate = origin.split(' ')[0] ?? origin;

  if (!originIsAllowed(candidate)) {
    next(
      new AppError(
        ErrorCode.FORBIDDEN,
        'Origine de la requête non autorisée',
        403,
      ),
    );
    return;
  }

  next();
}
