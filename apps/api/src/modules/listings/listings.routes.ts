import { Router } from 'express';
import { requireAuth, requireEmailVerified } from '../../middlewares/auth.middleware.js';
import { listingShareRateLimiter } from '../../middlewares/rate-limit.middleware.js';
import {
  createListing,
  getListingBySlug,
  listMyListings,
  searchListings,
  shareListing,
} from './listings.controller.js';

export const listingsRouter = Router();

listingsRouter.get('/', searchListings);
// IMPORTANT: /mine doit être déclaré AVANT /:slug, sinon Express
// interprète "mine" comme une valeur de :slug.
listingsRouter.get('/mine', requireAuth, listMyListings);
listingsRouter.get('/:slug', getListingBySlug);
// Publier une annonce = engagement commercial : réservé aux emails confirmés.
listingsRouter.post('/', requireAuth, requireEmailVerified, createListing);
// Partage public (aucune authentification) : la route est plus spécifique que
// '/' mais sur la méthode POST, donc aucune collision — et de toute façon elle
// est déclarée après, par souci de lecture.
listingsRouter.post('/:slug/share', listingShareRateLimiter, shareListing);
