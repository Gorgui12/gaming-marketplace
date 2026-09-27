import { Router } from 'express';
import { authRateLimiter, emailResendRateLimiter, emailCheckRateLimiter } from '../../middlewares/rate-limit.middleware.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import {
  login,
  logout,
  me,
  register,
  forgotPassword,
  resetPassword,
  googleAuth,
  verifyEmail,
  resendVerification,
  checkEmail,
} from './auth.controller.js';

export const authRouter = Router();

authRouter.post('/register', authRateLimiter, register);
authRouter.post('/login', authRateLimiter, login);
authRouter.post('/logout', logout);
authRouter.get('/me', requireAuth, me);
authRouter.post('/forgot-password', authRateLimiter, forgotPassword);
authRouter.post('/reset-password', authRateLimiter, resetPassword);
authRouter.post('/google', authRateLimiter, googleAuth);
authRouter.post('/verify-email', authRateLimiter, verifyEmail);
// Non authentifié : c'est précisément le cas d'usage du compte qui n'a jamais
// pu se connecter. Le rate limiter dédié (3 req / 15 min) protège la boîte
// du destinataire, le délai de 1 min côté service empêche le martèlement.
authRouter.post('/resend-verification', emailResendRateLimiter, resendVerification);
// Diagnostic d'une adresse AVANT l'inscription : forme, domaine jetable,
// faute de frappe probable, et délivrabilité réelle. Aucun accès à la base,
// donc aucun risque d'énumération.
authRouter.post('/check-email', emailCheckRateLimiter, checkEmail);
