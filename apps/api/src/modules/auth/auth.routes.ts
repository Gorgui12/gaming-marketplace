import { Router } from 'express';
import { authRateLimiter } from '../../middlewares/rate-limit.middleware.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { login, logout, me, register } from './auth.controller.js';

export const authRouter = Router();

authRouter.post('/register', authRateLimiter, register);
authRouter.post('/login', authRateLimiter, login);
authRouter.post('/logout', logout);
authRouter.get('/me', requireAuth, me);
