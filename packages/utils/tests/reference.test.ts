import { describe, it, expect } from 'vitest';
import { generatePaymentReference, generateAffiliateCode } from '../src/reference.js';

describe('generatePaymentReference', () => {
  it('matches the expected format GM-<base36>-<hex6>', () => {
    const ref = generatePaymentReference();
    expect(ref).toMatch(/^GM-[0-9A-Z]+-[0-9A-F]{6}$/);
  });

  it('generates unique references across many calls', () => {
    const refs = new Set(Array.from({ length: 200 }, () => generatePaymentReference()));
    expect(refs.size).toBe(200);
  });
});

describe('generateAffiliateCode', () => {
  it('strips accents, spaces and lowercase, keeping only A-Z0-9 plus a hex suffix', () => {
    const code = generateAffiliateCode('Gorgui Gaming');
    expect(code).toMatch(/^GORGUIGAMING[0-9A-F]{4}$/);
  });

  it('falls back to AFF when the display name has no usable characters', () => {
    const code = generateAffiliateCode('!!!');
    expect(code.startsWith('AFF')).toBe(true);
  });

  it('never exceeds 16 base characters before the suffix', () => {
    const code = generateAffiliateCode('A'.repeat(50));
    const base = code.slice(0, -4);
    expect(base.length).toBeLessThanOrEqual(16);
  });
});
