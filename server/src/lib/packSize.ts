export type PackUnit = 'g' | 'kg' | 'ml' | 'l' | 'pcs';

export interface PackSize {
  qty: number;
  unit: PackUnit;
}

const UNIT_ALIASES: Record<string, PackUnit> = {
  g: 'g',
  gm: 'g',
  gr: 'g',
  gram: 'g',
  grams: 'g',
  gramme: 'g',
  grammes: 'g',
  kg: 'kg',
  kgs: 'kg',
  ml: 'ml',
  l: 'l',
  ltr: 'l',
  litre: 'l',
  litres: 'l',
  liter: 'l',
  liters: 'l',
  pc: 'pcs',
  pcs: 'pcs',
  piece: 'pcs',
  pieces: 'pcs',
};

const UNIT_PATTERN = 'kgs?|gm|gr|gram(?:me)?s?|g|ml|ltr|litres?|liters?|l|pcs?|pieces?';
const NUM = '\\d+(?:\\.\\d+)?';

const SIZE_TOKEN = new RegExp(`(${NUM})\\s*(${UNIT_PATTERN})\\b`, 'gi');
const MULTIPACK = new RegExp(`(\\d+)\\s*[x×]\\s*(${NUM})\\s*(${UNIT_PATTERN})\\b`, 'i');
const MULTIPACK_REVERSED = new RegExp(`(${NUM})\\s*(${UNIT_PATTERN})\\s*[x×]\\s*(\\d+)\\b`, 'i');
// Count packs, mostly eggs: "10s", "30S", "pack of 12", "tray of 30".
const COUNT_SUFFIX = /\b(\d+)\s*s\b/i;
const COUNT_OF = /\b(?:pack|tray|box)\s+of\s+(\d+)\b/i;
const DOZEN = /\b(half\s+)?dozen\b/i;

/**
 * Parses a pack size out of a listing title, e.g.
 * "PLAIN FLOUR UNBLEACHED 1KG (#1242)" → { qty: 1, unit: 'kg' }.
 * Returns null when absent or ambiguous (e.g. "(1kg/5kg)" variable-product
 * parents — their variation rows carry the concrete size).
 */
export function parsePackSize(title: string): PackSize | null {
  const text = title.toLowerCase().replace(/\s+/g, ' ');

  // Two size tokens separated by "/" is a pack-size range ("(1kg/5kg)"),
  // not one size — unless a concrete variation suffix follows ("… 1kg/5kg —
  // Weight: 1kg"), in which case the last token is the real size.
  const tokens = [...text.matchAll(SIZE_TOKEN)];
  if (tokens.length >= 2) {
    const between = text.slice(
      tokens[0].index! + tokens[0][0].length,
      tokens[1].index!,
    );
    if (/^\s*\/\s*$/.test(between)) {
      if (tokens.length === 2) return null;
      const last = tokens[tokens.length - 1];
      const unit = UNIT_ALIASES[last[2]];
      return unit ? { qty: parseFloat(last[1]), unit } : null;
    }
  }

  const multi = text.match(MULTIPACK);
  if (multi) {
    const unit = UNIT_ALIASES[multi[3]];
    if (unit) return { qty: parseInt(multi[1], 10) * parseFloat(multi[2]), unit };
  }
  const multiRev = text.match(MULTIPACK_REVERSED);
  if (multiRev) {
    const unit = UNIT_ALIASES[multiRev[2]];
    if (unit) return { qty: parseFloat(multiRev[1]) * parseInt(multiRev[3], 10), unit };
  }

  if (tokens.length) {
    const unit = UNIT_ALIASES[tokens[0][2]];
    if (unit) return { qty: parseFloat(tokens[0][1]), unit };
  }

  const dozen = text.match(DOZEN);
  if (dozen) return { qty: dozen[1] ? 6 : 12, unit: 'pcs' };
  const countOf = text.match(COUNT_OF);
  if (countOf) return { qty: parseInt(countOf[1], 10), unit: 'pcs' };
  const countSuffix = text.match(COUNT_SUFFIX);
  if (countSuffix) return { qty: parseInt(countSuffix[1], 10), unit: 'pcs' };

  return null;
}

/** Comparison base: mass → kg, volume → l, counts → pcs. */
export function toBaseUnit(pack: PackSize): { qty: number; unit: 'kg' | 'l' | 'pcs' } {
  switch (pack.unit) {
    case 'g':
      return { qty: pack.qty / 1000, unit: 'kg' };
    case 'kg':
      return { qty: pack.qty, unit: 'kg' };
    case 'ml':
      return { qty: pack.qty / 1000, unit: 'l' };
    case 'l':
      return { qty: pack.qty, unit: 'l' };
    case 'pcs':
      return { qty: pack.qty, unit: 'pcs' };
  }
}

/** Price per base unit (SGD/kg etc.), or null when the pack size is unusable. */
export function unitPrice(
  price: number | null | undefined,
  qty: number | null | undefined,
  unit: string | null | undefined,
): { unitPrice: number; base: 'kg' | 'l' | 'pcs' } | null {
  if (price == null || qty == null || !unit || qty <= 0) return null;
  if (!isPackUnit(unit)) return null;
  const base = toBaseUnit({ qty, unit });
  if (base.qty <= 0) return null;
  return { unitPrice: price / base.qty, base: base.unit };
}

export function isPackUnit(unit: string): unit is PackUnit {
  return unit === 'g' || unit === 'kg' || unit === 'ml' || unit === 'l' || unit === 'pcs';
}
