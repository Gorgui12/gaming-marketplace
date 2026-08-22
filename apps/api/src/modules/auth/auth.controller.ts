import type { Request, Response } from 'express';
import { loginSchema, registerSchema } from '@gm/validation';
import { asyncHandler } from '../../lib/async-handler.js';
import { AuthService } from './auth.service.js';
import { createSessionToken } from './session.js';
import { env } from '../../config/env.js';

function setSessionCookie(res: Response, token: string): void {
  res.cookie(env.SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
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
  res.clearCookie(env.SESSION_COOKIE_NAME);
  res.status(200).json({ success: true, data: null, message: 'Déconnecté' });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json({ success: true, data: req.user ?? null });
});
