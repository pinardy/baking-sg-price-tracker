// Small pure helpers shared by the headless-browser providers, kept out of
// the browser code so they can be unit-tested without launching Chromium.

/** First "$2.90" / "2.90" style price in a string, or null. */
export function parsePrice(text: string | null | undefined): number | null {
  if (!text) return null;
  const match = text.replace(/,/g, '').match(/\$?\s*(\d+(?:\.\d{1,2})?)/);
  if (!match) return null;
  const value = parseFloat(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Normalized product-name key for matching a listing across re-searches. */
export function normalizeKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Next.js image proxy URLs ("/_next/image?url=<encoded>&w=..") wrap the real URL. */
export function decodeNextImage(src: string | null | undefined, origin: string): string | undefined {
  if (!src) return undefined;
  let url = src;
  const match = src.match(/[?&]url=([^&]+)/);
  if (match) url = decodeURIComponent(match[1]);
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('/')) return `${origin}${url}`;
  return url;
}
