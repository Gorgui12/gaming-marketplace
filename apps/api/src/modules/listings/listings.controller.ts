import type { Request, Response } from 'express';
import {
  createListingSchema,
  listingSearchQuerySchema,
  shareListingSchema,
} from '@gm/validation';
import { asyncHandler } from '../../lib/async-handler.js';
import { ListingsService } from './listings.service.js';

export const createListing = asyncHandler(async (req: Request, res: Response) => {
  const input = createListingSchema.parse(req.body);
  const listing = await ListingsService.create(req.user!.id, input);
  res.status(201).json({ success: true, data: { listing } });
});

export const searchListings = asyncHandler(async (req: Request, res: Response) => {
  const query = listingSearchQuerySchema.parse(req.query);
  const result = await ListingsService.search(query);
  res.status(200).json({ success: true, data: result });
});

export const getListingBySlug = asyncHandler(async (req: Request, res: Response) => {
  const listing = await ListingsService.getBySlug(req.params.slug!);
  res.status(200).json({ success: true, data: { listing } });
});

export const listMyListings = asyncHandler(async (req: Request, res: Response) => {
  const listings = await ListingsService.listMine(req.user!.id);
  res.status(200).json({ success: true, data: { listings } });
});

/**
 * Route publique : partager une annonce ne doit pas exiger un compte, sinon un
 * visiteur non connecté ne peut pas relayer le lien qu'on lui demande de
 * regarder. Le `userId` est donc optionnel et ne sert qu'à l'analyse.
 *
 * Un partage déjà compté renvoie 200 avec `counted: false` — voir
 * `ListingsService.registerShare`.
 */
export const shareListing = asyncHandler(async (req: Request, res: Response) => {
  const input = shareListingSchema.parse(req.body);
  const result = await ListingsService.registerShare(req.params.slug!, {
    sessionId: input.sessionId,
    channel: input.channel,
    userId: req.user?.id,
  });
  res.status(200).json({ success: true, data: result });
});
