import { describe, expect, it } from 'vitest';
import { parseBrand } from '../src/lib/brand.js';

describe('parseBrand', () => {
  const cases: [string, string | null][] = [
    ['PLAIN FLOUR UNBLEACHED 1KG (#1242)', null],
    ['Prima Flour Packet Flour - Plain', 'Prima Flour'],
    ['CONAPROLE BUTTER UNSALTED 200G', 'Conaprole'],
    ['BAKERS 365 PLAIN FLOUR 1KG', 'Bakers 365'],
    ['SCS Salted Butter 250g', 'SCS'],
    ['Golden Churn Butter 500g', 'Golden Churn'],
    ['Van Houten Cocoa Powder', 'Van Houten'],
    ['LIN CASTER SUGAR 1KG', 'Lin'],
    ['RedMan Top Flour', 'RedMan'],
    ['Bake King Bread Flour', 'Bake King'],
    // Word-boundary: "Anchorage" must not match "Anchor"
    ['Anchorage Special Sugar', null],
    // Longer names win over shorter substrings
    ['Prima Deli Cake Mix', 'Prima Deli'],
    ['Silicone Spatula', null],
  ];
  for (const [title, expected] of cases) {
    it(`${JSON.stringify(title)} -> ${expected}`, () => {
      expect(parseBrand(title)).toBe(expected);
    });
  }
});
