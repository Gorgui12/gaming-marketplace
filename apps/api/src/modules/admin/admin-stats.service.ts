import { ListingStatus, TransactionState } from '@gm/types';
import {
  AffiliateModel,
  DisputeModel,
  ListingModel,
  TransactionModel,
  UserModel,
} from './admin-stats.models.js';

export interface AdminStats {
  kpis: {
    totalUsers: number;
    newUsers7d: number;
    pendingListings: number;
    publishedListings: number;
    activeTransactions: number;
    completedTransactions: number;
    gmvCompleted: number;
    platformRevenue: number;
    pendingSellerPayouts: number;
    openDisputes: number;
    affiliatesTotal: number;
    affiliatesPending: number;
    commissionsAvailable: number;
  };
  transactionsByState: { state: string; count: number }[];
  listingsByStatus: { status: string; count: number }[];
  dailySeries: {
    date: string;
    transactions: number;
    volume: number;
    newListings: number;
    newUsers: number;
  }[];
}

const DAYS = 14;

function dayKey(offsetDaysAgo: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - offsetDaysAgo);
  return d.toISOString().slice(0, 10);
}

function lastNDays(): string[] {
  return Array.from({ length: DAYS }, (_, i) => dayKey(DAYS - 1 - i));
}

export class AdminStatsService {
  static async get(): Promise<AdminStats> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const seriesStart = new Date();
    seriesStart.setUTCHours(0, 0, 0, 0);
    seriesStart.setUTCDate(seriesStart.getUTCDate() - (DAYS - 1));

    const [
      totalUsers,
      newUsers7d,
      listingsByStatusRows,
      txByStateRows,
      completedAgg,
      pendingPayoutsAgg,
      openDisputes,
      affiliatesTotal,
      affiliatesPending,
      commissionsAvailableAgg,
      txPerDay,
      listingsPerDay,
      usersPerDay,
    ] = await Promise.all([
      UserModel.estimatedDocumentCount(),
      UserModel.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
      ListingModel.aggregate<{ _id: string; count: number }>().group({
        _id: '$status',
        count: { $sum: 1 },
      }),
      TransactionModel.aggregate<{ _id: string; count: number }>().group({
        _id: '$escrowStatus',
        count: { $sum: 1 },
      }),
      TransactionModel.aggregate<{
        _id: null;
        gmv: number;
        revenue: number;
        count: number;
      }>()
        .match({ escrowStatus: TransactionState.COMPLETED })
        .group({ _id: null, gmv: { $sum: '$amount' }, revenue: { $sum: '$platformFee' }, count: { $sum: 1 } }),
      TransactionModel.aggregate<{ _id: null; total: number }>()
        .match({ escrowStatus: TransactionState.SELLER_PAYOUT_PENDING })
        .group({ _id: null, total: { $sum: '$sellerAmount' } }),
      DisputeModel.countDocuments({
        status: { $in: ['OPEN', 'UNDER_REVIEW', 'WAITING_FOR_BUYER', 'WAITING_FOR_SELLER'] },
      }),
      AffiliateModel.countDocuments(),
      AffiliateModel.countDocuments({ status: 'PENDING' }),
      AffiliateModel.aggregate<{ _id: null; total: number }>().match({}).group({
        _id: null,
        total: { $sum: '$availableCommission' },
      }),
      TransactionModel.aggregate<{ _id: string; count: number; volume: number }>()
        .match({ createdAt: { $gte: seriesStart } })
        .group({
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
          volume: { $sum: '$amount' },
        }),
      ListingModel.aggregate<{ _id: string; count: number }>()
        .match({ createdAt: { $gte: seriesStart } })
        .group({
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        }),
      UserModel.aggregate<{ _id: string; count: number }>()
        .match({ createdAt: { $gte: seriesStart } })
        .group({
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        }),
    ]);

    const byState = new Map(txByStateRows.map((r) => [r._id, r.count]));
    const byListingStatus = new Map(listingsByStatusRows.map((r) => [r._id, r.count]));
    const txDayMap = new Map(txPerDay.map((r) => [r._id, r]));
    const listingDayMap = new Map(listingsPerDay.map((r) => [r._id, r.count]));
    const userDayMap = new Map(usersPerDay.map((r) => [r._id, r.count]));

    const completed = completedAgg[0];
    const payouts = pendingPayoutsAgg[0];

    return {
      kpis: {
        totalUsers,
        newUsers7d,
        pendingListings: byListingStatus.get('PENDING_REVIEW') ?? 0,
        publishedListings: byListingStatus.get('PUBLISHED') ?? 0,
        activeTransactions:
          (byState.get('ESCROW_ACTIVE') ?? 0) +
          (byState.get('SELLER_DELIVERED') ?? 0) +
          (byState.get('BUYER_REVIEWING') ?? 0) +
          (byState.get('DISPUTED') ?? 0),
        completedTransactions: completed?.count ?? 0,
        gmvCompleted: Math.round(completed?.gmv ?? 0),
        platformRevenue: Math.round(completed?.revenue ?? 0),
        pendingSellerPayouts: Math.round(payouts?.total ?? 0),
        openDisputes,
        affiliatesTotal,
        affiliatesPending,
        commissionsAvailable: Math.round(commissionsAvailableAgg[0]?.total ?? 0),
      },
      transactionsByState: Object.values(TransactionState).map((state) => ({
        state,
        count: byState.get(state) ?? 0,
      })),
      listingsByStatus: Object.values(ListingStatus).map((status) => ({
        status,
        count: byListingStatus.get(status) ?? 0,
      })),
      dailySeries: lastNDays().map((date) => ({
        date,
        transactions: txDayMap.get(date)?.count ?? 0,
        volume: Math.round(txDayMap.get(date)?.volume ?? 0),
        newListings: listingDayMap.get(date) ?? 0,
        newUsers: userDayMap.get(date) ?? 0,
      })),
    };
  }
}
