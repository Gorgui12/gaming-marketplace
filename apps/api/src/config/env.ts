import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),

  MONGODB_URI: z.string().min(1, 'MONGODB_URI est obligatoire'),

  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET doit faire au moins 32 caractères'),
  SESSION_COOKIE_NAME: z.string().default('gm_session'),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(7),

  // --- PayDunya ---
  // Pas de "mode" par défaut : forcer un choix explicite évite qu'un
  // environnement démarre accidentellement en 'live' sans s'en rendre compte.
  PAYDUNYA_MASTER_KEY: z.string().min(1),
  PAYDUNYA_PRIVATE_KEY: z.string().min(1),
  PAYDUNYA_PUBLIC_KEY: z.string().min(1),
  PAYDUNYA_TOKEN: z.string().min(1),
  PAYDUNYA_MODE: z.enum(['test', 'live']).default('test'),
  PAYDUNYA_IPN_PATH: z.string().default('/api/v1/payments/paydunya/ipn'),
  PAYDUNYA_STORE_NAME: z.string().default('Gaming Market'),

  STORAGE_PROVIDER: z.string().default('cloudinary'),
  STORAGE_API_KEY: z.string().optional(),
  STORAGE_API_SECRET: z.string().optional(),
  STORAGE_CLOUD_NAME: z.string().optional(),

  SMTP_HOST: z.string().min(1, 'SMTP_HOST est obligatoire'),
  SMTP_PORT: z.coerce.number().default(465),
  SMTP_USER: z.string().min(1, 'SMTP_USER est obligatoire'),
  SMTP_PASSWORD: z.string().min(1, 'SMTP_PASSWORD est obligatoire'),
  SMTP_FROM: z.string().min(1, 'SMTP_FROM est obligatoire'),

  GOOGLE_CLIENT_ID: z.string().optional(),

  CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),

  ACCOUNT_CREDENTIALS_ENCRYPTION_KEY: z
    .string()
    .min(32, 'ACCOUNT_CREDENTIALS_ENCRYPTION_KEY doit faire au moins 32 caractères'),
});

export type Env = z.infer<typeof envSchema>;

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
  return parsed.data;
}

export const env = loadEnv();

export const corsAllowedOrigins = env.CORS_ALLOWED_ORIGINS.split(',').map((o) => o.trim());
