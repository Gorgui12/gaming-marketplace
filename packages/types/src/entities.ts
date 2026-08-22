import type {
  AccessStatus,
  DisputeStatus,
  GameTermsStatus,
  ListingStatus,
  PaymentStatus,
  PayoutStatus,
  TransactionState,
  UserAccountStatus,
  UserRole,
  AffiliateStatus,
  CommissionType,
  CommissionBase,
  CommissionStatus,
  AttributionType,
  AffiliatePayoutStatus,
  DiscountType,
  FraudReviewStatus,
} from './enums.js';

export type ObjectIdLike = string;

export interface Reputation {
  average: number;
  count: number;
}

export interface User {
  _id: ObjectIdLike;
  email: string;
  phone?: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  username: string;
  avatar?: string;
  country: string; // ISO country code
  currency: string; // ISO currency code
  roles: UserRole[];
  emailVerified: boolean;
  phoneVerified: boolean;
  sellerStatus: 'NONE' | 'PENDING' | 'VERIFIED' | 'REJECTED';
  reputation: Reputation;
  transactionCount: number;
  successfulSales: number;
  successfulPurchases: number;
  riskScore: number;
  status: UserAccountStatus;
  /**
   * Référence optionnelle vers l'affilié à l'origine de l'inscription
   * (résolue par AffiliateAttributionService à la création du compte).
   * Ne remplace pas AffiliateAttribution — sert de cache rapide en lecture.
   */
  referredByAffiliate?: ObjectIdLike;
  createdAt: string;
  updatedAt: string;
}

export interface Game {
  _id: ObjectIdLike;
  name: string;
  slug: string;
  active: boolean;
  marketplaceEnabled: boolean;
  termsStatus: GameTermsStatus;
  termsNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  _id: ObjectIdLike;
  game: ObjectIdLike;
  name: string;
  slug: string;
  active: boolean;
}

export interface Listing {
  _id: ObjectIdLike;
  seller: ObjectIdLike;
  game: ObjectIdLike;
  category?: ObjectIdLike;
  title: string;
  slug: string;
  description: string;
  price: number;
  currency: string;
  country: string;
  teamStrength?: number;
  playerCount?: number;
  epicPlayers?: string[];
  showTimePlayers?: string[];
  featuredPlayers?: string[];
  screenshots: string[];
  accountMetadata?: Record<string, unknown>;
  status: ListingStatus;
  moderationStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  moderationNotes?: string;
  views: number;
  favoritesCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionStateHistoryEntry {
  from: TransactionState;
  to: TransactionState;
  at: string;
  actor: ObjectIdLike | 'SYSTEM';
}

export interface Transaction {
  _id: ObjectIdLike;
  buyer: ObjectIdLike;
  seller: ObjectIdLike;
  listing: ObjectIdLike;
  amount: number;
  currency: string;
  platformFee: number;
  sellerAmount: number;
  paymentProvider: 'paydunya';
  paymentReference: string;
  /**
   * Identifiant de transaction propre au provider (ex: invoice.token
   * PayDunya) — distinct de paymentReference (notre référence interne,
   * transmise en custom_data au provider et utilisée pour la corrélation
   * webhook). Utile pour toute vérification a posteriori directement
   * auprès du provider.
   */
  providerTransactionId?: string;
  paymentStatus: PaymentStatus;
  escrowStatus: TransactionState;
  accessStatus: AccessStatus;
  payoutStatus: PayoutStatus;
  buyerConfirmationAt?: string;
  disputeStatus: 'none' | 'open' | 'resolved';
  stateHistory: TransactionStateHistoryEntry[];
  /**
   * Attribution affiliée résolue au moment du checkout (voir
   * AffiliateAttributionService.resolveAttribution), portée par la
   * transaction elle-même pour que le webhook (qui n'a pas accès au
   * sessionId d'origine) puisse créer la conversion sans re-résoudre
   * l'attribution après coup.
   */
  attributedAffiliate?: ObjectIdLike;
  attributionType?: AttributionType;
  appliedPromoCode?: string;
  discountAmount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface DisputeEvidence {
  type: 'image' | 'text' | 'file';
  url?: string;
  content?: string;
  uploadedBy: ObjectIdLike;
  uploadedAt: string;
}

export interface Dispute {
  _id: ObjectIdLike;
  transaction: ObjectIdLike;
  openedBy: ObjectIdLike;
  reason: string;
  description: string;
  evidence: DisputeEvidence[];
  status: DisputeStatus;
  assignedAdmin?: ObjectIdLike;
  resolution?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Review {
  _id: ObjectIdLike;
  transaction: ObjectIdLike;
  author: ObjectIdLike;
  target: ObjectIdLike;
  rating: number; // 1..5
  comment?: string;
  createdAt: string;
}

export interface PlatformSettings {
  _id: ObjectIdLike;
  country: string;
  transactionFeePercentage: number;
  minimumFee: number;
  maximumFee: number;
  currencyRules: Record<string, unknown>;
}

export interface AuditLog {
  _id: ObjectIdLike;
  actor: ObjectIdLike | null;
  action: string;
  entityType: string;
  entityId: ObjectIdLike;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  timestamp: string;
}

// ==================== AFFILIATION ====================

export interface Affiliate {
  _id: ObjectIdLike;
  user: ObjectIdLike;
  affiliateCode: string;
  displayName: string;
  description?: string;
  status: AffiliateStatus;
  tier: ObjectIdLike;
  commissionRate: number;
  commissionType: CommissionType;
  cookieDurationDays: number;
  totalClicks: number;
  totalConversions: number;
  totalRevenue: number;
  totalCommission: number;
  availableCommission: number;
  pendingCommission: number;
  payoutThreshold: number;
  fraudReviewStatus: FraudReviewStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AffiliateTier {
  _id: ObjectIdLike;
  name: string;
  slug: string;
  defaultCommissionRate: number;
  minConversionsToUpgrade?: number;
  createdAt: string;
}

export interface AffiliateClick {
  _id: ObjectIdLike;
  affiliate: ObjectIdLike;
  affiliateCode: string;
  campaign?: ObjectIdLike;
  landingPage: string;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  deviceType?: string;
  country?: string;
  sessionId: string;
  userId?: ObjectIdLike;
  ipHash?: string;
  createdAt: string;
}

export interface AffiliateAttribution {
  _id: ObjectIdLike;
  affiliate: ObjectIdLike;
  affiliateCode: string;
  campaign?: ObjectIdLike;
  sessionId: string;
  userId?: ObjectIdLike;
  attributionType: AttributionType;
  expiresAt: string;
  consumedAt?: string;
  createdAt: string;
}

export interface PromoCode {
  _id: ObjectIdLike;
  code: string;
  affiliate?: ObjectIdLike;
  campaign?: ObjectIdLike;
  discountType: DiscountType;
  discountValue: number;
  minimumOrderAmount?: number;
  maximumDiscount?: number;
  usageLimit?: number;
  usagePerUser?: number;
  usedCount: number;
  startDate?: string;
  endDate?: string;
  active: boolean;
  createdAt: string;
}

export interface AffiliateCampaign {
  _id: ObjectIdLike;
  name: string;
  affiliate: ObjectIdLike;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  startDate?: string;
  endDate?: string;
  status: 'ACTIVE' | 'PAUSED' | 'ENDED';
  createdAt: string;
}

export interface AffiliateConversion {
  _id: ObjectIdLike;
  affiliate: ObjectIdLike;
  transaction: ObjectIdLike;
  buyer: ObjectIdLike;
  orderAmount: number;
  discountAmount: number;
  commissionBase: CommissionBase;
  commissionRate: number;
  commissionAmount: number;
  attributionType: AttributionType;
  promoCode?: string;
  status: CommissionStatus;
  fraudReviewStatus: FraudReviewStatus;
  clearanceDueAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AffiliatePayout {
  _id: ObjectIdLike;
  affiliate: ObjectIdLike;
  amount: number;
  currency: string;
  status: AffiliatePayoutStatus;
  method?: string;
  reference?: string;
  processedBy?: ObjectIdLike;
  createdAt: string;
  updatedAt: string;
}
