export const UserRole = {
  USER: 'USER',
  SELLER: 'SELLER',
  ADMIN: 'ADMIN',
  SUPER_ADMIN: 'SUPER_ADMIN',
  MODERATOR: 'MODERATOR',
  SUPPORT: 'SUPPORT',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const UserAccountStatus = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  BANNED: 'BANNED',
} as const;
export type UserAccountStatus = (typeof UserAccountStatus)[keyof typeof UserAccountStatus];

export const GameTermsStatus = {
  UNREVIEWED: 'UNREVIEWED',
  ALLOWED: 'ALLOWED',
  RESTRICTED: 'RESTRICTED',
  DISABLED: 'DISABLED',
} as const;
export type GameTermsStatus = (typeof GameTermsStatus)[keyof typeof GameTermsStatus];

export const ListingStatus = {
  DRAFT: 'DRAFT',
  PENDING_REVIEW: 'PENDING_REVIEW',
  PUBLISHED: 'PUBLISHED',
  RESERVED: 'RESERVED',
  SOLD: 'SOLD',
  SUSPENDED: 'SUSPENDED',
  REJECTED: 'REJECTED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type ListingStatus = (typeof ListingStatus)[keyof typeof ListingStatus];

/**
 * IMPORTANT — Séquestre purement logique (voir docs/PAYMENTS.md) :
 * CinetPay ne bloque pas les fonds nativement. ESCROW_ACTIVE signifie
 * uniquement "paiement reçu par la plateforme, en attente de payout vendeur",
 * pas "fonds gelés chez le prestataire".
 */
export const TransactionState = {
  CREATED: 'CREATED',
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  PAYMENT_CONFIRMED: 'PAYMENT_CONFIRMED',
  ESCROW_ACTIVE: 'ESCROW_ACTIVE',
  SELLER_DELIVERED: 'SELLER_DELIVERED',
  BUYER_REVIEWING: 'BUYER_REVIEWING',
  DISPUTED: 'DISPUTED',
  REFUND_PENDING: 'REFUND_PENDING',
  REFUNDED: 'REFUNDED',
  SELLER_PAYOUT_PENDING: 'SELLER_PAYOUT_PENDING',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
export type TransactionState = (typeof TransactionState)[keyof typeof TransactionState];

export const PaymentStatus = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const AccessStatus = {
  NOT_RELEASED: 'NOT_RELEASED',
  RELEASED: 'RELEASED',
  INVALIDATED: 'INVALIDATED',
} as const;
export type AccessStatus = (typeof AccessStatus)[keyof typeof AccessStatus];

export const DisputeStatus = {
  OPEN: 'OPEN',
  UNDER_REVIEW: 'UNDER_REVIEW',
  WAITING_FOR_BUYER: 'WAITING_FOR_BUYER',
  WAITING_FOR_SELLER: 'WAITING_FOR_SELLER',
  RESOLVED_BUYER: 'RESOLVED_BUYER',
  RESOLVED_SELLER: 'RESOLVED_SELLER',
  CLOSED: 'CLOSED',
} as const;
export type DisputeStatus = (typeof DisputeStatus)[keyof typeof DisputeStatus];

export const PayoutStatus = {
  NOT_APPLICABLE: 'NOT_APPLICABLE',
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  PAID: 'PAID',
  FAILED: 'FAILED',
} as const;
export type PayoutStatus = (typeof PayoutStatus)[keyof typeof PayoutStatus];

// ==================== AFFILIATION ====================

export const AffiliateStatus = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  REJECTED: 'REJECTED',
  TERMINATED: 'TERMINATED',
} as const;
export type AffiliateStatus = (typeof AffiliateStatus)[keyof typeof AffiliateStatus];

export const CommissionType = {
  PERCENTAGE: 'PERCENTAGE',
  FIXED_AMOUNT: 'FIXED_AMOUNT',
} as const;
export type CommissionType = (typeof CommissionType)[keyof typeof CommissionType];

export const CommissionBase = {
  ORDER_TOTAL: 'ORDER_TOTAL',
  NET_ORDER_AMOUNT: 'NET_ORDER_AMOUNT',
  PLATFORM_REVENUE: 'PLATFORM_REVENUE',
} as const;
export type CommissionBase = (typeof CommissionBase)[keyof typeof CommissionBase];

/**
 * Statuts de commission — suit le cycle de la transaction, jamais
 * immédiatement retirable. Voir docs/AFFILIATE.md.
 */
export const CommissionStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  AVAILABLE: 'AVAILABLE',
  PAID: 'PAID',
  REVERSED: 'REVERSED',
  CANCELLED: 'CANCELLED',
} as const;
export type CommissionStatus = (typeof CommissionStatus)[keyof typeof CommissionStatus];

export const AttributionType = {
  PROMO_CODE: 'PROMO_CODE',
  AFFILIATE_LINK: 'AFFILIATE_LINK',
  ACCOUNT_ATTRIBUTION: 'ACCOUNT_ATTRIBUTION',
} as const;
export type AttributionType = (typeof AttributionType)[keyof typeof AttributionType];

export const AffiliatePayoutStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  PAID: 'PAID',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;
export type AffiliatePayoutStatus =
  (typeof AffiliatePayoutStatus)[keyof typeof AffiliatePayoutStatus];

export const DiscountType = {
  PERCENTAGE: 'PERCENTAGE',
  FIXED_AMOUNT: 'FIXED_AMOUNT',
} as const;
export type DiscountType = (typeof DiscountType)[keyof typeof DiscountType];

export const FraudReviewStatus = {
  NORMAL: 'NORMAL',
  REVIEW: 'REVIEW',
  BLOCKED: 'BLOCKED',
} as const;
export type FraudReviewStatus = (typeof FraudReviewStatus)[keyof typeof FraudReviewStatus];
