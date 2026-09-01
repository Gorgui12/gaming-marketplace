import { Router } from 'express';
import type { Request, Response } from 'express';
import { UserRole } from '@gm/types';
import { createPostSchema, updatePostSchema } from '@gm/validation';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requireRole } from '../../middlewares/rbac.middleware.js';
import { BlogService } from './blog.service.js';

export const adminBlogRouter = Router();

adminBlogRouter.use(requireAuth, requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN));

adminBlogRouter.get(
  '/blog',
  asyncHandler(async (_req: Request, res: Response) => {
    const posts = await BlogService.listAllAdmin();
    res.status(200).json({ success: true, data: { posts } });
  }),
);

adminBlogRouter.post(
  '/blog',
  asyncHandler(async (req: Request, res: Response) => {
    const input = createPostSchema.parse(req.body);
    const post = await BlogService.create({ ...input, authorId: req.user!.id });
    res.status(201).json({ success: true, data: { post } });
  }),
);

adminBlogRouter.patch(
  '/blog/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const input = updatePostSchema.parse(req.body);
    const post = await BlogService.update(req.params.id!, req.user!.id, input);
    res.status(200).json({ success: true, data: { post } });
  }),
);

adminBlogRouter.delete(
  '/blog/:id',
  asyncHandler(async (req: Request, res: Response) => {
    await BlogService.delete(req.params.id!, req.user!.id);
    res.status(200).json({ success: true, data: null });
  }),
);
