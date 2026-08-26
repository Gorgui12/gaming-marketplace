import { ListingStatus } from '@gm/types';
import { AppError } from '../../lib/errors/app-error.js';
import { ErrorCode } from '../../lib/errors/error-codes.js';
import { ListingModel } from './listing.model.js';
import { AuditService } from '../audit/audit.service.js';
import { EmailService } from '../../lib/email/email.service.js';
import { UserModel } from '../users/user.model.js';

export class ListingsModerationService {
  static async listPending() {
    return ListingModel.find({ status: ListingStatus.PENDING_REVIEW }).sort({ createdAt: 1 });
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

    return listing;
  }
}
