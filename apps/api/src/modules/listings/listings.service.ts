import { ListingStatus } from '@gm/types';
import { isValidObjectId } from 'mongoose';
import { slugify, uniqueSlug } from '@gm/utils';
import type { CreateListingInput, ListingSearchQuery } from '@gm/validation';
import { AppError } from '../../lib/errors/app-error.js';
import { ErrorCode } from '../../lib/errors/error-codes.js';
import { GameModel } from '../games/game.model.js';
import { ListingModel } from './listing.model.js';

export class ListingsService {
  static async create(sellerId: string, input: CreateListingInput) {
    const game = await GameModel.findById(input.game);
    if (!game || !game.active) {
      throw AppError.notFound(ErrorCode.LISTING_NOT_FOUND, "Jeu introuvable ou inactif");
    }
    if (!game.marketplaceEnabled) {
      throw new AppError(
        ErrorCode.GAME_MARKETPLACE_DISABLED,
        'La création d\'annonces est désactivée pour ce jeu',
        403,
      );
    }

    const baseSlug = slugify(input.title);
    const slug = uniqueSlug(baseSlug, Date.now().toString(36));

    return ListingModel.create({
      ...input,
      seller: sellerId,
      slug,
      status: ListingStatus.PENDING_REVIEW,
      moderationStatus: 'PENDING',
    });
  }

  static async search(query: ListingSearchQuery) {
    const filter: Record<string, unknown> = { status: ListingStatus.PUBLISHED };
    if (query.game) {
      // Le front filtre par slug (ex: /marketplace/efootball -> ?game=efootball)
      // mais les annonces référencent le jeu par ObjectId. On résout donc le
      // slug (ou l'ObjectId direct) vers l'id du jeu.
      const game = isValidObjectId(query.game)
        ? await GameModel.findById(query.game).select({ _id: 1 })
        : await GameModel.findOne({ slug: query.game.toLowerCase() }).select({ _id: 1 });
      if (!game) {
        return {
          items: [],
          page: query.page,
          pageSize: query.pageSize,
          total: 0,
          totalPages: 0,
        };
      }
      filter.game = game._id;
    }
    if (query.country) filter.country = query.country;
    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      filter.price = {
        ...(query.minPrice !== undefined ? { $gte: query.minPrice } : {}),
        ...(query.maxPrice !== undefined ? { $lte: query.maxPrice } : {}),
      };
    }

    const sortMap: Record<ListingSearchQuery['sort'], Record<string, 1 | -1>> = {
      recent: { createdAt: -1 },
      price_asc: { price: 1 },
      price_desc: { price: -1 },
      popular: { views: -1 },
    };

    const skip = (query.page - 1) * query.pageSize;
    const [items, total] = await Promise.all([
      ListingModel.find(filter).sort(sortMap[query.sort]).skip(skip).limit(query.pageSize),
      ListingModel.countDocuments(filter),
    ]);

    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  static async getBySlug(slug: string) {
    const listing = await ListingModel.findOneAndUpdate(
      { slug, status: ListingStatus.PUBLISHED },
      { $inc: { views: 1 } },
      { new: true },
    );
    if (!listing) {
      throw AppError.notFound(ErrorCode.LISTING_NOT_FOUND, 'Annonce introuvable');
    }
    return listing;
  }

  static async listMine(sellerId: string) {
    return ListingModel.find({ seller: sellerId }).sort({ createdAt: -1 });
  }
}
