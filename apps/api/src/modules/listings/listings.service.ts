import { ListingStatus, type ShareChannel } from '@gm/types';
import { isValidObjectId } from 'mongoose';
import { slugify, uniqueSlug } from '@gm/utils';
import type { CreateListingInput, ListingSearchQuery } from '@gm/validation';
import { AppError } from '../../lib/errors/app-error.js';
import { ErrorCode } from '../../lib/errors/error-codes.js';
import { GameModel } from '../games/game.model.js';
import { ListingModel } from './listing.model.js';
import { ListingShareModel } from './listing-share.model.js';

/** Doit rester aligné avec la durée de vie du cookie `gm_track_sid`. */
const SHARE_DEDUP_WINDOW_DAYS = 90;

function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
}

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

  /**
   * Enregistre un partage et incrémente le compteur, une seule fois par
   * session de tracking.
   *
   * Le décompte passe par l'insertion d'un document `ListingShare` protégé par
   * un index unique `(listing, sessionId)` : c'est la seule façon d'être
   * correct sous concurrence. Un `exists()` suivi d'un `$inc` laisserait deux
   * requêtes parallèles passer entre la lecture et l'écriture.
   *
   * Un partage déjà compté n'est pas une erreur — renvoyer `counted: false`
   * permet au client d'ignorer le résultat sans lever d'exception, sinon un
   * double-clic sur le bouton WhatsApp afficherait une erreur alors que le
   * partage a bien eu lieu.
   */
  static async registerShare(
    slug: string,
    input: { sessionId: string; channel: ShareChannel; userId?: string },
  ) {
    const listing = await ListingModel.findOne({ slug, status: ListingStatus.PUBLISHED }).select({
      _id: 1,
      shareCount: 1,
    });
    if (!listing) {
      throw AppError.notFound(ErrorCode.LISTING_NOT_FOUND, 'Annonce introuvable');
    }

    try {
      await ListingShareModel.create({
        listing: listing._id,
        sessionId: input.sessionId,
        channel: input.channel,
        user: input.userId,
        expiresAt: new Date(Date.now() + SHARE_DEDUP_WINDOW_DAYS * 24 * 60 * 60 * 1000),
      });
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        return { counted: false, shareCount: listing.shareCount ?? 0 };
      }
      throw err;
    }

    // Pas de `.select()` après un `findByIdAndUpdate` : inutile ici (on ne
    // renvoie que le compteur) et le fake model de tests renvoie une
    // promesse, pas une chaîne comme le vrai Query Mongoose.
    const updated = await ListingModel.findByIdAndUpdate(
      listing._id,
      { $inc: { shareCount: 1 } },
      { new: true },
    );

    return { counted: true, shareCount: updated?.shareCount ?? (listing.shareCount ?? 0) + 1 };
  }
}
