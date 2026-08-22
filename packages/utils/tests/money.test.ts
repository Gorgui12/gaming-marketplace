import { describe, it, expect } from 'vitest';
import { roundMoney, splitAmount } from '../src/money.js';

describe('roundMoney', () => {
  it('rounds to the nearest integer', () => {
    expect(roundMoney(1000.4)).toBe(1000);
    expect(roundMoney(1000.5)).toBe(1001);
    expect(roundMoney(999.99)).toBe(1000);
  });
});

describe('splitAmount', () => {
  it('splits total into sellerAmount and platformFee without losing money to rounding', () => {
    const { sellerAmount, platformFee } = splitAmount(50_000, 5_000);
    expect(platformFee).toBe(5_000);
    expect(sellerAmount).toBe(45_000);
    expect(sellerAmount + platformFee).toBe(50_000);
  });

  it('rounds fee amount before subtracting, so the split always sums back to total', () => {
    const total = 33_333;
    const fee = total * 0.1; // 3333.3 — non-integer on purpose
    const { sellerAmount, platformFee } = splitAmount(total, fee);
    expect(sellerAmount + platformFee).toBe(total);
  });
});
