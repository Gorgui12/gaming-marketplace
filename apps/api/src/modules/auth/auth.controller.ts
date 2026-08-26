import type { Request, Response } from 'express';
import {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  googleAuthSchema,
} from '@gm/validation';
import { asyncHandler } from '../../lib/async-handler.js';
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

export const register = asyncHandler(async (req: Request, res: Response) => {
  const input = registerSchema.parse(req.body);
  const user = await AuthService.register(input);
  const token = createSessionToken(String(user._id), user.roles);
  setSessionCookie(res, token);
  res.status(201).json({
    success: true,
    data: { id: user._id, email: user.email, username: user.username },
  });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const input = loginSchema.parse(req.body);
  const user = await AuthService.login(input);
  const token = createSessionToken(String(user._id), user.roles);
  setSessionCookie(res, token);
  res.status(200).json({
    success: true,
    data: { id: user._id, email: user.email, username: user.username },
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
  const token = createSessionToken(String(user._id), user.roles);
  setSessionCookie(res, token);
  res.status(200).json({
    success: true,
    data: { id: user._id, email: user.email, username: user.username },
  });
});

export const googleAuth = asyncHandler(async (req: Request, res: Response) => {
  const input = googleAuthSchema.parse(req.body);
  const user = await AuthService.googleAuth(input);
  const token = createSessionToken(String(user._id), user.roles);
  setSessionCookie(res, token);
  res.status(200).json({
    success: true,
    data: { id: user._id, email: user.email, username: user.username },
  });
});
