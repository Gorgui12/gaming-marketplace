import { describe, it, expect } from 'vitest';
import { computeFee, DEFAULT_FEE_RULE, type FeeRule } from '../src/fees.js';

describe('computeFee', () => {
  it('applies the default 10% rate above the minimum threshold', () => {
    expect(computeFee(50_000)).toBe(5_000);
  });

  it('enforces the minimum fee on small transactions', () => {
    // 1% of 1000 = 10, well below the 500 FCFA minimum
    const rule: FeeRule = { transactionFeePercentage: 0.01, minimumFee: 500 };
    expect(computeFee(1_000, rule)).toBe(500);
  });

  it('caps at the maximum fee when configured', () => {
    const rule: FeeRule = { transactionFeePercentage: 0.1, minimumFee: 500, maximumFee: 10_000 };
    expect(computeFee(1_000_000, rule)).toBe(10_000);
  });

  it('uses DEFAULT_FEE_RULE when no rule is passed', () => {
    expect(computeFee(100_000)).toBe(computeFee(100_000, DEFAULT_FEE_RULE));
  });
});
