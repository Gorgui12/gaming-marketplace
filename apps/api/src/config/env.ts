import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),

  // URL publique de l'app web, utilisée pour les liens des emails sortants
  APP_URL: z.string().url().default('http://localhost:3000'),

  MONGODB_URI: z.string().min(1, 'MONGODB_URI est obligatoire'),

  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET doit faire au moins 32 caractères'),
  SESSION_COOKIE_NAME: z.string().default('gm_session'),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(7),

  // --- Choix du provider de paiement actif ---
  // Passe à 'paydunya' pour revenir à l'ancien prestataire (conservé en
  // dormance). Ce choix conditionne les clés obligatoires ci-dessous,
  // validées de façon croisée après le parse (voir loadEnv).
  PAYMENT_PROVIDER: z.enum(['paydunya', 'unitechpay']).default('unitechpay'),

  // --- UnitechPay ---
  // Optionnel dans le schéma de base : la validation croisée (superRefine)
  // l'exige uniquement quand PAYMENT_PROVIDER=unitechpay, pour ne pas
  // bloquer le retour à paydunya si l'on n'a pas de clé UnitechPay.
  UNITECHPAY_API_KEY: z.string().min(1).optional(),
  UNITECHPAY_BASE_URL: z.string().url().default('https://api.unitech.sn/api.php'),

  // --- PayDunya ---
  // Optionnel désormais : bloquer le démarrage quand on n'utilise pas
  // PayDunya forcerait des clés inutiles sous PAYMENT_PROVIDER=unitechpay.
  // Pas de "mode" par défaut : forcer un choix explicite évite qu'un
  // environnement démarre accidentellement en 'live' sans s'en rendre compte.
  PAYDUNYA_MASTER_KEY: z.string().min(1).optional(),
  PAYDUNYA_PRIVATE_KEY: z.string().min(1).optional(),
  PAYDUNYA_PUBLIC_KEY: z.string().min(1).optional(),
  PAYDUNYA_TOKEN: z.string().min(1).optional(),
  PAYDUNYA_MODE: z.enum(['test', 'live']).default('test'),
  PAYDUNYA_IPN_PATH: z.string().default('/api/v1/payments/paydunya/ipn'),
  PAYDUNYA_STORE_NAME: z.string().default('Gaming Market'),

  STORAGE_PROVIDER: z.string().default('cloudinary'),
  STORAGE_API_KEY: z.string().optional(),
  STORAGE_API_SECRET: z.string().optional(),
  STORAGE_CLOUD_NAME: z.string().optional(),

  RESEND_API_KEY: z.string().min(1, 'RESEND_API_KEY est obligatoire'),
  RESEND_FROM: z.string().min(1, 'RESEND_FROM est obligatoire'),

  // Adresse de support affichée dans les pieds d'email et dans les pages web
  // qui invitent à contacter l'équipe.
  EMAIL_SUPPORT_ADDRESS: z
    .string()
    .email('EMAIL_SUPPORT_ADDRESS doit être une adresse email valide')
    .default('support@gamingmarket.store'),

  // Reply-To de tous les emails sortants. Indispensable : un `From` en
  // `noreply@` sans Reply-To est traité comme un envoi non sollicité par les
  // filtres (Apple/iCloud en particulier), et rendait inopérantes les
  // mentions « répondez à cet email » présentes dans les templates.
  RESEND_REPLY_TO: z
    .string()
    .email('RESEND_REPLY_TO doit être une adresse email valide')
    .default('support@gamingmarket.store'),

  // --- Newsletter (emails commerciaux) ---
  //
  // `CRON_SECRET` protège l'endpoint d'envoi. Le service de cron externe
  // (cron-job.org) l'envoie en en-tête `x-cron-secret` : impossible de le
  // deviner, et il n'est pas dans l'URL comme le serait une query string
  // (qui finit dans tous les logs d'accès et dans l'historique du navigateur).
  //
  // Sans valeur, la route refuse tout appel : c'est volontairement bloquant
  // en production plutôt que silencieusement ouvert. « Je n'ai pas configuré
  // de newsletter » ne doit pas se traduire par « l'endpoint d'envoi est
  // accessible à quiconque tombe sur l'URL ».
  CRON_SECRET: z.string().min(16, 'CRON_SECRET doit faire au moins 16 caractères').optional(),

  /**
   * Nombre minimal de vues pour qu'une annonce puisse figurer dans la
   * sélection.
   *
   * `views` est gonflable (incrémenté à chaque affichage de la page, sans
   * session ni déduplication), donc un classement brut récompense la
   * manipulation : il suffit de recharger sa page pour passer devant tout le
   * monde. Un seuil rend la triche coûteuse — il faut générer autant de
   * visites que le seuil, pour une seule place dans le top 5.
   */
  NEWSLETTER_MIN_VIEWS: z.coerce.number().int().min(0).default(20),

  /**
   * Fenêtre de fraîcheur de la sélection, en jours.
   *
   * Doit rester inférieure à l'écart entre deux envois : avec une fenêtre de
   * 7 jours et deux envois hebdomadaires, la même annonce apparaît en moyenne
   * dans les deux emails de la même semaine. Une fenêtre de 3 jours laisse un
   * angle mort entre les deux envois.
   */
  NEWSLETTER_WINDOW_DAYS: z.coerce.number().int().min(1).max(30).default(3),

  /**
   * Jours de la semaine où la newsletter part, en jours ISO.
   *
   * 1 = lundi … 7 = dimanche. Valeur par défaut : mardi (2), soit un envoi
   * par semaine.
   *
   * Pourquoi cette variable existe, alors que la planification pourrait se
   * faire dans cron-job.org : tous les planificateurs gratuits n'offrent pas de
   * sélecteur de jour de la semaine, seulement une fréquence ("toutes les 4
   * minutes"). Placer la règle ici permet de laisser le cron sonner aussi
   * souvent qu'il veut — c'est l'API qui décide si aujourd'hui est un jour
   * d'envoi, et l'idempotence absorbe le reste.
   *
   * Format : liste de 1 à 7, séparée par des virgules, sans espaces.
   * `2,5` = mardi et vendredi, soit deux envois par semaine.
   */
  NEWSLETTER_DAYS: z.string().default('2'),

  GOOGLE_CLIENT_ID: z.string().optional(),

  CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),

  // Nombre de proxys de confiance devant l'API, pour que `req.ip` vaille
  // l'IP réelle du client et non celle du proxy. Le nombre de sauts diffère
  // selon l'hébergeur, d'où une variable plutôt qu'une constante en dur :
  //   - Render  = 2 (proxy Render, puis Cloudflare devant lui)
  //   - Fly.io  = 1 (proxy Fly seul)
  //   - local   = 0 (requête directe, aucun proxy)
  // Une valeur trop basse fait retomber tous les clients sur l'IP du proxy :
  // ils partagent alors un seul bucket de rate limit, et l'anti-fraude affiliés
  // (hash de req.ip) les voit tous venir de la même origine.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),

  ACCOUNT_CREDENTIALS_ENCRYPTION_KEY: z
    .string()
    .min(32, 'ACCOUNT_CREDENTIALS_ENCRYPTION_KEY doit faire au moins 32 caractères'),
}).superRefine((val, ctx) => {
  // Validation croisée : les clés obligatoires dépendent du provider actif,
  // pour qu'on ne parte pas en production avec un fournisseur configuré
  // mais ses secrets manquants.
  if (val.PAYMENT_PROVIDER === 'paydunya') {
    const missing = (
      [
        'PAYDUNYA_MASTER_KEY',
        'PAYDUNYA_PRIVATE_KEY',
        'PAYDUNYA_PUBLIC_KEY',
        'PAYDUNYA_TOKEN',
      ] as const
    ).filter((k) => !val[k]);
    if (missing.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `PAYMENT_PROVIDER=paydunya exige les clés PayDunya : ${missing.join(', ')}`,
      });
    }
  }
  if (val.PAYMENT_PROVIDER === 'unitechpay' && !val.UNITECHPAY_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'PAYMENT_PROVIDER=unitechpay exige UNITECHPAY_API_KEY',
    });
  }

  // Une valeur invalide ne doit pas démarrer en silence puis réduire la
  // cadence à zéro (« aucun jour ne correspond ») : l'optima serait de ne
  // jamais envoyer, et rien ne le signalerait.
  const days = parseNewsletterDays(val.NEWSLETTER_DAYS);
  if (days === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['NEWSLETTER_DAYS'],
      message:
        'NEWSLETTER_DAYS doit être une liste de jours ISO (1=lundi … 7=dimanche) séparés par des virgules, par exemple « 2» ou « 2,5»',
    });
  }
});

/**
 * Parse `NEWSLETTER_DAYS` en tableau de jours ISO.
 *
 * Renvoie `null` si la valeur est inexploitable, ce qui permet à `superRefine`
 * de la signaler au démarrage plutôt que de la laisser produire une cadence
 * nulle. Doublons ignorés, ordre conservé — un `5,2,5` reste deux envois.
 */
function parseNewsletterDays(raw: string): number[] | null {
  const parts = raw
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p !== '');
  if (parts.length === 0) return null;
  const days: number[] = [];
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 1 || n > 7) return null;
    if (!days.includes(n)) days.push(n);
  }
  return days;
}

// Le schéma rend les clés de chaque provider optionnelles en base pour ne
// pas bloquer le démarrage quand l'autre provider est actif. La validation
// croisée (superRefine) garantit néanmoins leur présence quand leur
// provider est sélectionné — on peut donc les typer `string` côté
// consommation (paydunya.provider.ts / unitechpay.provider.ts n'ont pas à
// gérer `undefined`).
export type Env = Omit<
  z.infer<typeof envSchema>,
  | 'PAYDUNYA_MASTER_KEY'
  | 'PAYDUNYA_PRIVATE_KEY'
  | 'PAYDUNYA_PUBLIC_KEY'
  | 'PAYDUNYA_TOKEN'
  | 'UNITECHPAY_API_KEY'
> & {
  PAYDUNYA_MASTER_KEY: string;
  PAYDUNYA_PRIVATE_KEY: string;
  PAYDUNYA_PUBLIC_KEY: string;
  PAYDUNYA_TOKEN: string;
  UNITECHPAY_API_KEY: string;
};

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('❌ Variables d\'environnement invalides ou manquantes:');
    for (const issue of parsed.error.issues) {
      // eslint-disable-next-line no-console
      console.error(`   - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }
  return parsed.data as Env;
}

export const env = loadEnv();

/**
 * Jours d'envoi effectifs, en jours ISO (1 = lundi … 7 = dimanche).
 *
 * Déclaré après `env` : la valeur en dépend. Validée au démarrage par
 * `superRefine`, donc une valeur mal formée empêche de démarrer plutôt que de
 * produire silencieusement une cadence nulle.
 */
export const newsletterDays: number[] = parseNewsletterDays(env.NEWSLETTER_DAYS) ?? [];

export const corsAllowedOrigins = env.CORS_ALLOWED_ORIGINS.split(',').map((o) => o.trim());
