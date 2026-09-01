import { ListingStatus, NotificationType, TransactionState } from '@gm/types';
import { AppError } from '../../lib/errors/app-error.js';
import { ErrorCode } from '../../lib/errors/error-codes.js';
import { ListingModel } from './listing.model.js';
import { TransactionModel } from '../transactions/transaction.model.js';
import { AuditService } from '../audit/audit.service.js';
import { EmailService } from '../../lib/email/email.service.js';
import { UserModel } from '../users/user.model.js';
import { NotificationService } from '../notifications/notification.service.js';

const SELLER_PROJECTION = 'email firstName lastName username';
const GAME_PROJECTION = 'title slug';

export interface AdminListingsQuery {
  status?: string;
  search?: string;
  page: number;
  pageSize: number;
}

/**
 * États de transaction « terminaux » : une annonce liée à une transaction
 * encore active ne doit pas pouvoir être supprimée définitivement (le flux
 * vendeur/acheteur y fait référence).
 */
const TERMINAL_TRANSACTION_STATES = [
  TransactionState.COMPLETED,
  TransactionState.REFUNDED,
  TransactionState.CANCELLED,
] as const;

export class ListingsModerationService {
  static async listPending() {
    return ListingModel.find({ status: ListingStatus.PENDING_REVIEW })
      .sort({ createdAt: 1 })
      .populate('seller', SELLER_PROJECTION)
      .populate('game', GAME_PROJECTION);
  }

  static async listAll(query: AdminListingsQuery) {
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.search) {
      const rx = new RegExp(query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.title = rx;
    }

    const skip = (query.page - 1) * query.pageSize;
    const [listings, total] = await Promise.all([
      ListingModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(query.pageSize)
        .populate('seller', SELLER_PROJECTION)
        .populate('game', GAME_PROJECTION),
      ListingModel.countDocuments(filter),
    ]);

    return {
      listings,
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  static async hardDelete(listingId: string, adminId: string) {
    const listing = await ListingModel.findById(listingId);
    if (!listing) {
      throw AppError.notFound(ErrorCode.LISTING_NOT_FOUND, 'Annonce introuvable');
    }

    const activeTransactions = await TransactionModel.countDocuments({
      listing: listingId,
      escrowStatus: { $nin: TERMINAL_TRANSACTION_STATES },
    });
    if (activeTransactions > 0) {
      throw AppError.conflict(
        ErrorCode.CONFLICT,
        'Impossible de supprimer cette annonce : une transaction est encore en cours.',
      );
    }

    await ListingModel.deleteOne({ _id: listingId });

    await AuditService.log({
      actor: adminId,
      action: 'admin.listing_deleted',
      entityType: 'Listing',
      entityId: listingId,
      metadata: { title: listing.title, slug: listing.slug },
    });

    // Notification email vendeur
    const seller = await UserModel.findById(listing.seller).select('email firstName');
    if (seller) {
      EmailService.sendListingRemoved({
        to: seller.email,
        firstName: seller.firstName,
        listingTitle: listing.title,
      }).catch(() => {});
    }
    NotificationService.create({
      userId: String(listing.seller),
      type: NotificationType.LISTING_DELETED,
      title: 'Annonce supprimée',
      message: `Votre annonce "${listing.title}" a été supprimée par un administrateur.`,
      metadata: { listingId },
    }).catch(() => {});

    return { id: listingId, title: listing.title };
  }

  static async unpublish(listingId: string, adminId: string) {
    const listing = await ListingModel.findById(listingId);
    if (!listing) {
      throw AppError.notFound(ErrorCode.LISTING_NOT_FOUND, 'Annonce introuvable');
    }
    listing.status = ListingStatus.SUSPENDED;
    await listing.save();

    await AuditService.log({
      actor: adminId,
      action: 'admin.listing_unpublished',
      entityType: 'Listing',
      entityId: listingId,
      metadata: { title: listing.title },
    });

    NotificationService.create({
      userId: String(listing.seller),
      type: NotificationType.LISTING_UNPUBLISHED,
      title: 'Annonce masquée',
      message: `Votre annonce "${listing.title}" n'est plus visible sur la marketplace.`,
      metadata: { listingId },
    }).catch(() => {});

    return listing;
  }

  static async forcePublish(listingId: string, adminId: string) {
    const listing = await ListingModel.findById(listingId);
    if (!listing) {
      throw AppError.notFound(ErrorCode.LISTING_NOT_FOUND, 'Annonce introuvable');
    }
    listing.status = ListingStatus.PUBLISHED;
    listing.moderationStatus = 'APPROVED';
    listing.moderationNotes = undefined;
    await listing.save();

    await AuditService.log({
      actor: adminId,
      action: 'admin.listing_published',
      entityType: 'Listing',
      entityId: listingId,
      metadata: { title: listing.title },
    });

    NotificationService.create({
      userId: String(listing.seller),
      type: NotificationType.LISTING_APPROVED,
      title: 'Annonce republiée',
      message: `Votre annonce "${listing.title}" est de nouveau visible sur la marketplace.`,
      metadata: { listingId },
    }).catch(() => {});

    return listing;
  }

  static async approve(listingId: string, adminId: string) {
    const listing = await ListingModel.findById(listingId);
    if (!listing) {
      throw AppError.notFound(ErrorCode.LISTING_NOT_FOUND, 'Annonce introuvable');
    }
    listing.status = ListingStatus.PUBLISHED;
    listing.moderationStatus = 'APPROVED';
    await listing.save();

    await AuditService.log({
      actor: adminId,
      action: 'admin.listing_approved',
      entityType: 'Listing',
      entityId: listingId,
    });

    // Notification email vendeur
    const seller = await UserModel.findById(listing.seller).select('email firstName');
    if (seller) {
      EmailService.sendListingApproved({
        to: seller.email, firstName: seller.firstName, listingTitle: listing.title,
      }).catch(() => {});
    }
    NotificationService.create({
      userId: String(listing.seller),
      type: NotificationType.LISTING_APPROVED,
      title: 'Annonce approuvée',
      message: `Votre annonce "${listing.title}" est désormais publiée.`,
      metadata: { listingId: String(listing._id) },
    }).catch(() => {});

    return listing;
  }

  static async reject(listingId: string, adminId: string, notes?: string) {
    const listing = await ListingModel.findById(listingId);
    if (!listing) {
      throw AppError.notFound(ErrorCode.LISTING_NOT_FOUND, 'Annonce introuvable');
    }
    listing.status = ListingStatus.REJECTED;
    listing.moderationStatus = 'REJECTED';
    listing.moderationNotes = notes;
    await listing.save();

    await AuditService.log({
      actor: adminId,
      action: 'admin.listing_rejected',
      entityType: 'Listing',
      entityId: listingId,
      metadata: { notes },
    });

    // Notification email vendeur
    const seller = await UserModel.findById(listing.seller).select('email firstName');
    if (seller) {
      EmailService.sendListingRejected({
        to: seller.email, firstName: seller.firstName, listingTitle: listing.title, notes,
      }).catch(() => {});
    }
    NotificationService.create({
      userId: String(listing.seller),
      type: NotificationType.LISTING_REJECTED,
      title: 'Annonce refusée',
      message: `Votre annonce "${listing.title}" n'a pas été approuvée.${notes ? ` Motif : ${notes}` : ''}`,
      metadata: { listingId: String(listing._id) },
    }).catch(() => {});

    return listing;
  }
}