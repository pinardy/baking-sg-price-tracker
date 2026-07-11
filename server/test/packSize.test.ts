import { describe, expect, it } from 'vitest';
import { parsePackSize, toBaseUnit, unitPrice } from '../src/lib/packSize.js';

describe('parsePackSize', () => {
  const cases: [string, ReturnType<typeof parsePackSize>][] = [
    // Real title shapes from the four shops
    ['PLAIN FLOUR UNBLEACHED 1KG (#1242)', { qty: 1, unit: 'kg' }],
    ['Bake King Bread Flour 500g', { qty: 500, unit: 'g' }],
    ['Caster Sugar 500 g', { qty: 500, unit: 'g' }],
    ['Prima Flour Packet Flour - Plain 1kg', { qty: 1, unit: 'kg' }],
    ['CONAPROLE BUTTER UNSALTED 200G (EXP 2026-12-18)', { qty: 200, unit: 'g' }],
    ['Whipping Cream 1L', { qty: 1, unit: 'l' }],
    ['UHT Full Cream Milk 250ml', { qty: 250, unit: 'ml' }],
    ['Instant Dry Yeast 11 gm', { qty: 11, unit: 'g' }],
    ['Bread Flour — 5kg', { qty: 5, unit: 'kg' }],
    ['Almond Ground 1.5kg', { qty: 1.5, unit: 'kg' }],
    // Egg counts
    ['Pasar Fresh Eggs 10s', { qty: 10, unit: 'pcs' }],
    ['Fresh Eggs 30S', { qty: 30, unit: 'pcs' }],
    ['Eggs 1 Dozen', { qty: 12, unit: 'pcs' }],
    ['Half Dozen Kampong Eggs', { qty: 6, unit: 'pcs' }],
    ['Eggs Pack of 12', { qty: 12, unit: 'pcs' }],
    ['Eggs Tray of 30', { qty: 30, unit: 'pcs' }],
    // Multipacks
    ['Evaporated Milk 12 x 250ml', { qty: 3000, unit: 'ml' }],
    ['CHOC CHIPS 2 X 1KG', { qty: 2, unit: 'kg' }],
    ['Evaporated Milk 250ml x 12', { qty: 3000, unit: 'ml' }],
    // Ambiguous variable-product parents → null
    ['Bake King Bread Flour (1kg/5kg)', null],
    ['Bread Flour (500g / 1kg)', null],
    // …but a concrete variation suffix after the range wins
    ['Bake King Plain Flour – 1kg/5kg — Weight: 1kg', { qty: 1, unit: 'kg' }],
    ['Bake King Bread Flour – 1kg/5kg — Weight: 5kg', { qty: 5, unit: 'kg' }],
    // First metric token wins; %, SKU numbers, and unit-less titles don't match
    ['Vanilla Extract 118ml (4oz)', { qty: 118, unit: 'ml' }],
    ['Dark Couverture 70% 200G', { qty: 200, unit: 'g' }],
    ['Baking Spatula (#8811)', null],
    ['Silicone Mat', null],
  ];

  for (const [title, expected] of cases) {
    it(`parses ${JSON.stringify(title)}`, () => {
      expect(parsePackSize(title)).toEqual(expected);
    });
  }
});

describe('toBaseUnit', () => {
  it('converts mass to kg', () => {
    expect(toBaseUnit({ qty: 500, unit: 'g' })).toEqual({ qty: 0.5, unit: 'kg' });
    expect(toBaseUnit({ qty: 2, unit: 'kg' })).toEqual({ qty: 2, unit: 'kg' });
  });
  it('converts volume to l', () => {
    expect(toBaseUnit({ qty: 250, unit: 'ml' })).toEqual({ qty: 0.25, unit: 'l' });
  });
  it('keeps counts as pcs', () => {
    expect(toBaseUnit({ qty: 30, unit: 'pcs' })).toEqual({ qty: 30, unit: 'pcs' });
  });
});

describe('unitPrice', () => {
  it('computes SGD per kg', () => {
    expect(unitPrice(2.8, 1, 'kg')?.unitPrice).toBeCloseTo(2.8, 10);
    expect(unitPrice(3.15, 200, 'g')?.base).toBe('kg');
    expect(unitPrice(3.15, 200, 'g')?.unitPrice).toBeCloseTo(15.75, 10);
  });
  it('computes SGD per piece', () => {
    expect(unitPrice(4.2, 10, 'pcs')?.base).toBe('pcs');
    expect(unitPrice(4.2, 10, 'pcs')?.unitPrice).toBeCloseTo(0.42, 10);
  });
  it('returns null for missing or bad inputs', () => {
    expect(unitPrice(null, 1, 'kg')).toBeNull();
    expect(unitPrice(2.8, null, 'kg')).toBeNull();
    expect(unitPrice(2.8, 0, 'kg')).toBeNull();
    expect(unitPrice(2.8, 1, 'bunch')).toBeNull();
  });
});
