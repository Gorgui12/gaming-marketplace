/**
 * Rate limit des envois d'emails depuis le back-office.
 *
 * Un double-clic sur « envoyer » déclencherait deux envois parallèles à toute
 * la base — l'idempotence n'existe pas ici, et l'envoi est asynchrone. Ce
 * limiteur protège contre ce geste réflexe, pas contre une campagne légitime.
 */
export const adminEmailRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Trop d\'envois d\'emails déclenchés. Réessayez dans quelques minutes.',
    },
  },
});
