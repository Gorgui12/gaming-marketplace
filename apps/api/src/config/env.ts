import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),

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

  GOOGLE_CLIENT_ID: z.string().optional(),

  CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),

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
});

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

export const corsAllowedOrigins = env.CORS_ALLOWED_ORIGINS.split(',').map((o) => o.trim());
