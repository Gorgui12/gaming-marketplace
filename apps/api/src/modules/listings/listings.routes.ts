import { Router } from 'express';
import { requireAuth, requireEmailVerified } from '../../middlewares/auth.middleware.js';
import {
  createListing,
  getListingBySlug,
  listMyListings,
  searchListings,
} from './listings.controller.js';

export const listingsRouter = Router();

listingsRouter.get('/', searchListings);
// IMPORTANT: /mine doit être déclaré AVANT /:slug, sinon Express
// interprète "mine" comme une valeur de :slug.
listingsRouter.get('/mine', requireAuth, listMyListings);
listingsRouter.get('/:slug', getListingBySlug);
// Publier une annonce = engagement commercial : réservé aux emails confirmés.
listingsRouter.post('/', requireAuth, requireEmailVerified, createListing);
