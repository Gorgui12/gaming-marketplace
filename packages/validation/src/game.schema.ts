import { z } from 'zod';

export const createGameSchema = z.object({
  name: z.string().min(2).max(60),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, 'Lettres minuscules, chiffres et tirets uniquement'),
});
export type CreateGameInput = z.infer<typeof createGameSchema>;

export const updateGameSchema = z.object({
  active: z.boolean().optional(),
  marketplaceEnabled: z.boolean().optional(),
  termsStatus: z.enum(['UNREVIEWED', 'ALLOWED', 'RESTRICTED', 'DISABLED']).optional(),
  termsNotes: z.string().max(2000).optional(),
});
export type UpdateGameInput = z.infer<typeof updateGameSchema>;
