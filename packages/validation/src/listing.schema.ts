import { z } from 'zod';

export const createListingSchema = z.object({
  game: z.string().min(1),
  category: z.string().optional(),
  title: z.string().min(5).max(140),
  description: z.string().min(20).max(5000),
  price: z.number().positive().max(100_000_000),
  currency: z.string().length(3),
  country: z.string().length(2),
  teamStrength: z.number().int().nonnegative().optional(),
  playerCount: z.number().int().nonnegative().optional(),
  epicPlayers: z.array(z.string()).max(50).optional(),
  showTimePlayers: z.array(z.string()).max(50).optional(),
  featuredPlayers: z.array(z.string()).max(50).optional(),
  screenshots: z.array(z.string().url()).min(1).max(10),
});
export type CreateListingInput = z.infer<typeof createListingSchema>;

export const updateListingSchema = createListingSchema.partial();
export type UpdateListingInput = z.infer<typeof updateListingSchema>;

export const listingSearchQuerySchema = z.object({
  game: z.string().optional(),
  country: z.string().length(2).optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().positive().optional(),
  sort: z.enum(['recent', 'price_asc', 'price_desc', 'popular']).default('recent'),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(20),
});
export type ListingSearchQuery = z.infer<typeof listingSearchQuerySchema>;
