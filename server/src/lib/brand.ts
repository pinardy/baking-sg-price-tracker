// Curated list of baking-ingredient brands seen across the SG shops. Longer
// names first so "Bakers 365" wins over a bare "Baker". Matching is
// word-boundary, case-insensitive; the canonical form (value) is stored.
const BRANDS: [pattern: RegExp, canonical: string][] = (
  [
    'Golden Churn',
    'Elle & Vire',
    'Bakers 365',
    'Van Houten',
    'Emborg',
    'President',
    'Conaprole',
    'Anchor',
    'Meadow Fresh',
    'Millac',
    'Pura',
    'Greenfields',
    'Farmhouse',
    'Magnolia',
    'Marigold',
    'SCS',
    'Prima Deli',
    'Prima Flour',
    'Prima',
    'RedMan',
    'Bake King',
    'Kraft',
    'Philadelphia',
    'Hershey',
    'Cadbury',
    'Nestle',
    'Nestlé',
    'Valrhona',
    'Callebaut',
    'Hershey\'s',
    'Lin',
    'Gold Tree',
    'Pagoda',
    'Flying Man',
    'White Wings',
    'Kialla',
    'LorAnn',
    'Foodsterr',
    'Sun Maid',
    'Tate & Lyle',
    'Alsa',
    'Dr. Oetker',
    'Fleischmann',
    'Saf-instant',
    'Mauripan',
    'Phoon Huat',
  ] as const
).map((name) => [new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(name)}(?:[^a-z0-9]|$)`, 'i'), name]);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Extracts a known brand from a listing title, or null. */
export function parseBrand(title: string | null | undefined): string | null {
  if (!title) return null;
  for (const [pattern, canonical] of BRANDS) {
    if (pattern.test(title)) return canonical;
  }
  return null;
}
