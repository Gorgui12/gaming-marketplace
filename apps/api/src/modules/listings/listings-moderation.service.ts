import { ListingStatus } from '@gm/types';
import { AppError } from '../../lib/errors/app-error.js';
import { ErrorCode } from '../../lib/errors/error-codes.js';
import { ListingModel } from './listing.model.js';
import { AuditService } from '../audit/audit.service.js';

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

    return listing;
  }
}
