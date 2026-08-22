import { describe, it, expect } from 'vitest';
import { TransactionState } from '@gm/types';
import {
  canTransition,
  assertTransition,
} from '../src/modules/transactions/transaction-state-machine.js';

describe('transaction state machine', () => {
  it('allows the full happy path in order', () => {
    const path: Array<[TransactionState, TransactionState, 'BUYER' | 'SELLER' | 'SYSTEM']> = [
      [TransactionState.CREATED, TransactionState.PAYMENT_PENDING, 'SYSTEM'],
      [TransactionState.PAYMENT_PENDING, TransactionState.PAYMENT_CONFIRMED, 'SYSTEM'],
      [TransactionState.PAYMENT_CONFIRMED, TransactionState.ESCROW_ACTIVE, 'SYSTEM'],
      [TransactionState.ESCROW_ACTIVE, TransactionState.SELLER_DELIVERED, 'SELLER'],
      [TransactionState.SELLER_DELIVERED, TransactionState.BUYER_REVIEWING, 'SYSTEM'],
      [TransactionState.BUYER_REVIEWING, TransactionState.COMPLETED, 'BUYER'],
    ];
    for (const [from, to, actor] of path) {
      expect(canTransition(from, to, actor)).toBe(true);
    }
  });

  it('rejects skipping a state (e.g. CREATED straight to ESCROW_ACTIVE)', () => {
    expect(canTransition(TransactionState.CREATED, TransactionState.ESCROW_ACTIVE, 'SYSTEM')).toBe(
      false,
    );
  });

  it('rejects a buyer marking their own transaction as SELLER_DELIVERED', () => {
    // Garantit qu'un acheteur ne peut jamais se faire passer pour le
    // vendeur et déclencher la livraison lui-même.
    expect(
      canTransition(TransactionState.ESCROW_ACTIVE, TransactionState.SELLER_DELIVERED, 'BUYER'),
    ).toBe(false);
  });

  it('rejects a seller confirming the transaction as if they were the buyer', () => {
    expect(
      canTransition(TransactionState.BUYER_REVIEWING, TransactionState.COMPLETED, 'SELLER'),
    ).toBe(false);
  });

  it('only ADMIN can move a DISPUTED transaction toward refund or seller payout', () => {
    expect(
      canTransition(TransactionState.DISPUTED, TransactionState.REFUND_PENDING, 'ADMIN'),
    ).toBe(true);
    expect(
      canTransition(TransactionState.DISPUTED, TransactionState.REFUND_PENDING, 'BUYER'),
    ).toBe(false);
    expect(
      canTransition(TransactionState.DISPUTED, TransactionState.REFUND_PENDING, 'SELLER'),
    ).toBe(false);
  });

  it('treats terminal states as dead ends — no outgoing transition is ever valid', () => {
    const terminal = [
      TransactionState.COMPLETED,
      TransactionState.REFUNDED,
      TransactionState.CANCELLED,
    ];
    const allStates = Object.values(TransactionState);
    for (const from of terminal) {
      for (const to of allStates) {
        expect(canTransition(from, to, 'ADMIN')).toBe(false);
      }
    }
  });

  it('assertTransition throws AppError with INVALID_STATE_TRANSITION on an illegal move', () => {
    expect(() =>
      assertTransition(TransactionState.CREATED, TransactionState.COMPLETED, 'BUYER'),
    ).toThrowError(/Transition invalide/);
  });

  it('assertTransition does not throw on a legal move', () => {
    expect(() =>
      assertTransition(TransactionState.CREATED, TransactionState.PAYMENT_PENDING, 'SYSTEM'),
    ).not.toThrow();
  });
});
