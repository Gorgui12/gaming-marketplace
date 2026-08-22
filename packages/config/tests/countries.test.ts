import { describe, it, expect } from 'vitest';
import { getCountry, getLaunchedCountries } from '../src/countries.js';
import { formatAmount } from '../src/currencies.js';

describe('getCountry', () => {
  it('resolves a country regardless of input case', () => {
    expect(getCountry('sn')?.currency).toBe('XOF');
    expect(getCountry('SN')?.currency).toBe('XOF');
  });

  it('returns undefined for an unregistered country', () => {
    expect(getCountry('FR')).toBeUndefined();
  });

  it('does not assume a shared currency across all neighboring countries', () => {
    // Régression volontaire contre l'hypothèse "toute l'Afrique de l'Ouest = XOF"
    expect(getCountry('GN')?.currency).toBe('GNF');
    expect(getCountry('NG')?.currency).toBe('NGN');
    expect(getCountry('GH')?.currency).toBe('GHS');
  });
});

describe('getLaunchedCountries', () => {
  it('only returns countries explicitly marked as launched', () => {
    const launched = getLaunchedCountries();
    expect(launched.every((c) => c.launched)).toBe(true);
    expect(launched.some((c) => c.code === 'SN')).toBe(true);
  });
});

describe('formatAmount', () => {
  it('throws on an unknown currency rather than silently formatting wrong', () => {
    expect(() => formatAmount(1000, 'USD')).toThrow();
  });

  it('formats XOF with zero decimal digits', () => {
    const formatted = formatAmount(50_000, 'XOF');
    expect(formatted).not.toMatch(/,\d{2}(\D|$)/); // pas de centimes
  });
});
