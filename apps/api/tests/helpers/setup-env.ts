// Chargé par vitest avant tout import de code applicatif (voir
// vitest.config.ts -> setupFiles). Fournit des valeurs factices mais
// valides pour que config/env.ts ne fasse pas process.exit(1) pendant les
// tests. Aucune valeur ici n'est une clé réelle.
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://localhost:27017/test';
process.env.SESSION_SECRET = 'test-session-secret-at-least-32-chars-long';
process.env.PAYDUNYA_MASTER_KEY = 'test-master-key';
process.env.PAYDUNYA_PRIVATE_KEY = 'test-private-key';
process.env.PAYDUNYA_PUBLIC_KEY = 'test-public-key';
process.env.PAYDUNYA_TOKEN = 'test-token';
process.env.PAYDUNYA_MODE = 'test';
process.env.SMTP_HOST = 'smtp.test.invalid';
process.env.SMTP_USER = 'test@test.invalid';
process.env.SMTP_PASSWORD = 'test-password';
process.env.SMTP_FROM = 'Gaming Marketplace <no-reply@test.invalid>';
process.env.ACCOUNT_CREDENTIALS_ENCRYPTION_KEY = 'test-encryption-key-32-bytes-min';
