import { describe, it, expect } from 'vitest';
import { slugify, uniqueSlug } from '../src/slug.js';

describe('slugify', () => {
  it('lowercases, strips accents and replaces spaces with hyphens', () => {
    expect(slugify('Compte Épique éFootball')).toBe('compte-epique-efootball');
  });

  it('collapses repeated separators and trims leading/trailing hyphens', () => {
    expect(slugify('  Hello   World!!  ')).toBe('hello-world');
  });
});

describe('uniqueSlug', () => {
  it('appends the suffix after slugifying the base', () => {
    expect(uniqueSlug('Compte eFootball', 'abc123')).toBe('compte-efootball-abc123');
  });
});
