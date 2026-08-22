import { TransactionState } from '@gm/types';
import { AppError } from '../../lib/errors/app-error.js';
import { ErrorCode } from '../../lib/errors/error-codes.js';

export type Actor = 'BUYER' | 'SELLER' | 'ADMIN' | 'SYSTEM';

interface TransitionRule {
  to: TransactionState;
  allowedActors: Actor[];
}

/**
 * Graphe de transitions autorisées. C'est la SEULE source de vérité pour
 * savoir si un changement de statut de transaction est légal. Aucune route
 * ne doit permettre de fixer escrowStatus directement — uniquement via
 * `applyTransition`.
 *
 * Rappel: ESCROW_ACTIVE = paiement reçu par la plateforme, séquestre
 * purement logique (pas de blocage réel chez PayDunya).
 */
const TRANSITIONS: Record<TransactionState, TransitionRule[]> = {
  [TransactionState.CREATED]: [
    { to: TransactionState.PAYMENT_PENDING, allowedActors: ['SYSTEM'] },
    { to: TransactionState.CANCELLED, allowedActors: ['BUYER', 'SYSTEM', 'ADMIN'] },
  ],
  [TransactionState.PAYMENT_PENDING]: [
    { to: TransactionState.PAYMENT_CONFIRMED, allowedActors: ['SYSTEM'] },
    { to: TransactionState.CANCELLED, allowedActors: ['SYSTEM', 'ADMIN'] },
  ],
  [TransactionState.PAYMENT_CONFIRMED]: [
    { to: TransactionState.ESCROW_ACTIVE, allowedActors: ['SYSTEM'] },
  ],
  [TransactionState.ESCROW_ACTIVE]: [
    { to: TransactionState.SELLER_DELIVERED, allowedActors: ['SELLER'] },
    { to: TransactionState.DISPUTED, allowedActors: ['BUYER', 'ADMIN'] },
  ],
  [TransactionState.SELLER_DELIVERED]: [
    { to: TransactionState.BUYER_REVIEWING, allowedActors: ['SYSTEM'] },
  ],
  [TransactionState.BUYER_REVIEWING]: [
    { to: TransactionState.COMPLETED, allowedActors: ['BUYER'] },
    { to: TransactionState.DISPUTED, allowedActors: ['BUYER', 'ADMIN'] },
  ],
  [TransactionState.DISPUTED]: [
    { to: TransactionState.REFUND_PENDING, allowedActors: ['ADMIN'] },
    { to: TransactionState.SELLER_PAYOUT_PENDING, allowedActors: ['ADMIN'] },
  ],
  [TransactionState.REFUND_PENDING]: [
    { to: TransactionState.REFUNDED, allowedActors: ['ADMIN', 'SYSTEM'] },
  ],
  [TransactionState.SELLER_PAYOUT_PENDING]: [
    { to: TransactionState.COMPLETED, allowedActors: ['ADMIN', 'SYSTEM'] },
  ],
  [TransactionState.COMPLETED]: [],
  [TransactionState.REFUNDED]: [],
  [TransactionState.CANCELLED]: [],
};

export function canTransition(
  current: TransactionState,
  next: TransactionState,
  actor: Actor,
): boolean {
  const rules = TRANSITIONS[current] ?? [];
  return rules.some((rule) => rule.to === next && rule.allowedActors.includes(actor));
}

export function assertTransition(
  current: TransactionState,
  next: TransactionState,
  actor: Actor,
): void {
  if (!canTransition(current, next, actor)) {
    throw new AppError(
      ErrorCode.INVALID_STATE_TRANSITION,
      `Transition invalide: ${current} -> ${next} (acteur: ${actor})`,
      409,
    );
  }
}
