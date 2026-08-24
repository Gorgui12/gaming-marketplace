import { z } from 'zod';

// Minimum de checkout imposé par PayDunya : toute facture d'un montant
// inférieur est refusée avec response_code 4003 ("Invalid Total Amount.
// Mimimum checkout amount is 200 FCFA."). On le partage ici car il contraint
// à la fois le prix des annonces et le montant net facturé au checkout.
export const MIN_CHECKOUT_AMOUNT_XOF = 200;

export const initiateTransactionSchema = z.object({
  listingId: z.string().min(1),
  promoCode: z.string().min(1).max(30).optional(),
  // sessionId utilisé pour résoudre une attribution affiliée par clic
  // (voir AffiliateAttributionService) — optionnel, absent si aucun
  // tracking de session n'est actif côté client.
  sessionId: z.string().optional(),
});
export type InitiateTransactionInput = z.infer<typeof initiateTransactionSchema>;

/**
 * Payload utilisé par le vendeur pour transmettre les accès du compte
 * une fois la transaction en ESCROW_ACTIVE. Ce payload part chiffré
 * côté SecureAccountAccessService — jamais journalisé en clair.
 */
export const deliverAccountAccessSchema = z.object({
  transactionId: z.string().min(1),
  credentialsPayload: z
    .string()
    .min(1, 'Les identifiants ne peuvent pas être vides')
    .max(10_000),
  deliveryNotes: z.string().max(2000).optional(),
});
export type DeliverAccountAccessInput = z.infer<typeof deliverAccountAccessSchema>;

export const confirmTransactionSchema = z.object({
  transactionId: z.string().min(1),
});
export type ConfirmTransactionInput = z.infer<typeof confirmTransactionSchema>;

export const openDisputeSchema = z.object({
  transactionId: z.string().min(1),
  reason: z.enum([
    'ACCESS_INCORRECT',
    'ACCOUNT_MISMATCH',
    'SELLER_UNRESPONSIVE',
    'ACCOUNT_INACCESSIBLE',
    'MAJOR_ISSUE',
    'OTHER',
  ]),
  description: z.string().min(20).max(3000),
});
export type OpenDisputeInput = z.infer<typeof openDisputeSchema>;
