import { z } from 'zod';

export const createPostSchema = z.object({
  title: z.string().min(3).max(160),
  excerpt: z.string().min(10).max(300),
  content: z.string().min(20),
  coverImage: z.string().url().optional(),
  category: z.string().min(2).max(60),
  tags: z.array(z.string()).max(10).optional(),
  seoTitle: z.string().max(70).optional(),
  seoDescription: z.string().max(160).optional(),
  published: z.boolean().optional(),
});
export type CreatePostInput = z.infer<typeof createPostSchema>;

export const updatePostSchema = createPostSchema.partial();
export type UpdatePostInput = z.infer<typeof updatePostSchema>;

export const listPostsQuerySchema = z.object({
  category: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(10),
});
export type ListPostsQuery = z.infer<typeof listPostsQuerySchema>;
