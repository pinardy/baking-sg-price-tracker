import { describe, expect, it } from 'vitest';
import { decodeNextImage, normalizeKey, parsePrice } from '../src/lib/scrape.js';

describe('parsePrice', () => {
  it('reads dollar-prefixed and bare prices', () => {
    expect(parsePrice('$2.90')).toBe(2.9);
    expect(parsePrice('  $12.05 ')).toBe(12.05);
    expect(parsePrice('2.11')).toBe(2.11);
    expect(parsePrice('$1,299.00')).toBe(1299);
  });
  it('takes the first price (promo strips concatenate several)', () => {
    expect(parsePrice('$2.05 $2.11')).toBe(2.05);
  });
  it('returns null for junk', () => {
    expect(parsePrice('Add to Cart')).toBeNull();
    expect(parsePrice(null)).toBeNull();
    expect(parsePrice('$0.00')).toBeNull();
  });
});

describe('normalizeKey', () => {
  it('slugifies a product name for stable matching', () => {
    expect(normalizeKey('BAKERS 365 Plain Flour')).toBe('bakers-365-plain-flour');
    expect(normalizeKey('House Brand Gram Dhall Flour')).toBe('house-brand-gram-dhall-flour');
    expect(normalizeKey('  Prima  Cake-Flour!! ')).toBe('prima-cake-flour');
  });
});

describe('decodeNextImage', () => {
  const origin = 'https://coldstorage.com.sg';
  it('unwraps the Next.js image proxy url param', () => {
    expect(
      decodeNextImage('/_next/image?url=https%3A%2F%2Fmcos.coldstorage.com.sg%2Fa.jpg&w=256&q=75', origin),
    ).toBe('https://mcos.coldstorage.com.sg/a.jpg');
  });
  it('absolutizes root-relative and protocol-relative urls', () => {
    expect(decodeNextImage('/img/x.png', origin)).toBe('https://coldstorage.com.sg/img/x.png');
    expect(decodeNextImage('//cdn.example.com/x.png', origin)).toBe('https://cdn.example.com/x.png');
  });
  it('passes through absolute urls and handles null', () => {
    expect(decodeNextImage('https://x.com/a.jpg', origin)).toBe('https://x.com/a.jpg');
    expect(decodeNextImage(null, origin)).toBeUndefined();
  });
});
