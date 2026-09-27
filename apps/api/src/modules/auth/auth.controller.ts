import type { Request, Response } from 'express';
import {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  googleAuthSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  checkEmailSchema,
  analyseEmail,
} from '@gm/validation';
import { asyncHandler } from '../../lib/async-handler.js';
import { checkEmailDomain } from '../../lib/email/email-deliverability.js';
import { AuthService } from './auth.service.js';
import { createSessionToken } from './session.js';
import { env } from '../../config/env.js';

function sessionCookieOptions(isProduction: boolean) {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? ('none' as const) : ('lax' as const),
  };
}

function setSessionCookie(res: Response, token: string): void {
  const isProduction = env.NODE_ENV === 'production';
  res.cookie(env.SESSION_COOKIE_NAME, token, {
    ...sessionCookieOptions(isProduction),
    maxAge: env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

/**
 * Émet le cookie de session en reprenant la version de session du compte.
 * Ce `sessionVersion` est rejoué dans `attachUser` : s'il diffère de celui
 * en base, le cookie est rejeté. C'est ce qui permet de révoquer les
 * sessions d'un utilisateur (bannissement, changement de rôle, de mot de
 * passe) sans attendre l'expiration du cookie.
 */
function sessionTokenFor(user: {
  _id: unknown;
  roles: string[];
  sessionVersion?: number;
}): string {
  return createSessionToken(String(user._id), user.roles, user.sessionVersion ?? 0);
}

export const register = asyncHandler(async (req: Request, res: Response) => {
  const input = registerSchema.parse(req.body);
  const user = await AuthService.register(input);
  const token = sessionTokenFor(user);
  setSessionCookie(res, token);
  res.status(201).json({
    success: true,
    // `emailVerified` est renvoyé explicitement : le front doit savoir dès
    // la réponse d'inscription qu'il a encore une action à faire. Le cookie de
    // session est bien émis (navigation libre), mais les actions engageantes
    // restent bloquées tant que l'email n'est pas confirmé.
    data: {
      id: user._id,
      email: user.email,
      username: user.username,
      emailVerified: user.emailVerified === true,
    },
  });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const input = loginSchema.parse(req.body);
  const user = await AuthService.login(input);
  const token = sessionTokenFor(user);
  setSessionCookie(res, token);
  res.status(200).json({
    success: true,
    data: {
      id: user._id,
      email: user.email,
      username: user.username,
      emailVerified: user.emailVerified === true,
    },
  });
});

export const logout = asyncHandler(async (_req: Request, res: Response) => {
  const isProduction = env.NODE_ENV === 'production';
  res.clearCookie(env.SESSION_COOKIE_NAME, sessionCookieOptions(isProduction));
  res.status(200).json({ success: true, data: null, message: 'Déconnecté' });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json({ success: true, data: req.user ?? null });
});

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const input = forgotPasswordSchema.parse(req.body);
  await AuthService.forgotPassword(input);
  // Toujours retourner 200 pour ne pas révéler si l'email existe
  res.status(200).json({
    success: true,
    data: { message: 'Si un compte existe avec cet email, vous recevrez un lien de réinitialisation.' },
  });
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const input = resetPasswordSchema.parse(req.body);
  const user = await AuthService.resetPassword(input);
  const token = sessionTokenFor(user);
  setSessionCookie(res, token);
  res.status(200).json({
    success: true,
    data: {
      id: user._id,
      email: user.email,
      username: user.username,
      emailVerified: user.emailVerified === true,
    },
  });
});

export const googleAuth = asyncHandler(async (req: Request, res: Response) => {
  const input = googleAuthSchema.parse(req.body);
  const user = await AuthService.googleAuth(input);
  const token = sessionTokenFor(user);
  setSessionCookie(res, token);
  res.status(200).json({
    success: true,
    data: {
      id: user._id,
      email: user.email,
      username: user.username,
      emailVerified: user.emailVerified === true,
    },
  });
});

export const verifyEmail = asyncHandler(async (req: Request, res: Response) => {
  const input = verifyEmailSchema.parse(req.body);
  const user = await AuthService.verifyEmail(input);
  res.status(200).json({
    success: true,
    data: {
      email: user.email,
      emailVerified: user.emailVerified,
      message: 'Votre email a été confirmé. Merci !',
    },
  });
});

export const resendVerification = asyncHandler(async (req: Request, res: Response) => {
  const input = resendVerificationSchema.parse(req.body);
  // `attachUser` est monté globalement : la session suffit à identifier le
  // compte quand elle existe, sans avoir à exposer l'email côté client.
  await AuthService.resendVerification(input, req.user?.id);
  // Message volontairement générique : ni l'existence du compte, ni son état
  // de validation ne doivent être déductibles de la réponse.
  res.status(200).json({
    success: true,
    data: {
      message:
        "Si un compte non confirmé correspond à cette adresse, un nouveau lien vient d'être envoyé.",
    },
  });
});

export const checkEmail = asyncHandler(async (req: Request, res: Response) => {
  const input = checkEmailSchema.parse(req.body);
  const { problem, suggestion } = analyseEmail(input.email);

  // La délivrabilité réelle n'est demandée que si l'adresse est bien formée :
  // inutile d'aller interroger le DNS pour un domaine déjà refusé.
  let deliverable: boolean | null = null;
  if (!problem) {
    const domain = input.email.slice(input.email.lastIndexOf('@') + 1);
    deliverable = (await checkEmailDomain(domain)) !== 'undeliverable';
  }

  res.status(200).json({
    success: true,
    data: { problem, suggestion, deliverable },
  });
});
