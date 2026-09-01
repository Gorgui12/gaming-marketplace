import { Router } from 'express';
import type { Request, Response } from 'express';
import { listPostsQuerySchema } from '@gm/validation';
import { asyncHandler } from '../../lib/async-handler.js';
import { BlogService } from './blog.service.js';

export const blogRouter = Router();

blogRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const query = listPostsQuerySchema.parse(req.query);
    const result = await BlogService.listPublished(query);
    res.status(200).json({ success: true, data: result });
  }),
);

blogRouter.get(
  '/:slug',
  asyncHandler(async (req: Request, res: Response) => {
    const post = await BlogService.getBySlug(req.params.slug!);
    res.status(200).json({ success: true, data: { post } });
  }),
);
