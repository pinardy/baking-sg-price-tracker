import { useState } from 'react';
import { api, formatPrice, formatUnitPrice, PackUnit, ProviderSearchOutcome, SearchResult } from '../api';
import { ProviderTag } from './ProviderTag';

interface Props {
  /** Called when the per-source selection changes. */
  onSelectionChange: (picks: SearchResult[]) => void;
  initialQuery?: string;
}

const PACK_UNITS: PackUnit[] = ['g', 'kg', 'ml', 'l', 'pcs'];

/**
 * Searches every enabled shop at once and lets the user pick at most one
 * matching result per shop — this is how canonical products get linked
 * to concrete retailer listings. A parsed pack size is shown per result
 * and can be corrected before attaching (sent as a manual override).
 */
export function SourceSearchPanel({ onSelectionChange, initialQuery = '' }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [outcomes, setOutcomes] = useState<ProviderSearchOutcome[] | null>(null);
  const [loading, setLoading] = useState(false);
  // packEdited distinguishes a user correction (sent to the server, stored as
  // a manual override) from the parsed value merely displayed (not sent — the
  // server re-parses the title itself, keeping the value refreshable).
  type PickState = SearchResult & { packEdited?: boolean };
  const [picks, setPicks] = useState<Map<string, PickState>>(new Map());

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setOutcomes(null);
    try {
      setOutcomes(await api.search(query.trim()));
    } catch (err) {
      setOutcomes([]);
    } finally {
      setLoading(false);
    }
  };

  const update = (next: Map<string, PickState>) => {
    setPicks(next);
    onSelectionChange(
      [...next.values()].map(({ packEdited, ...pick }) =>
        packEdited ? pick : { ...pick, packQty: undefined, packUnit: undefined },
      ),
    );
  };

  const toggle = (result: SearchResult) => {
    const next = new Map(picks);
    const current = next.get(result.providerId);
    if (current && sameResult(current, result)) next.delete(result.providerId);
    else next.set(result.providerId, { ...result });
    update(next);
  };

  const setPack = (providerId: string, qty: number | undefined, unit: PackUnit | undefined) => {
    const next = new Map(picks);
    const current = next.get(providerId);
    if (!current) return;
    next.set(providerId, { ...current, packQty: qty, packUnit: unit, packEdited: true });
    update(next);
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          style={{ flex: 1 }}
          placeholder="e.g. plain flour 1kg — or paste a bakewithyen.sg product URL"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
        />
        <button className="primary" onClick={search} disabled={loading || !query.trim()}>
          {loading ? 'Searching…' : 'Search all shops'}
        </button>
      </div>
      {loading && (
        <div className="muted">
          <span className="spinner" /> Searching each shop (rate-limited politely, can take ~15s)…
        </div>
      )}
      {outcomes?.map((outcome) => (
        <div key={outcome.providerId} style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 6 }}>
            <ProviderTag id={outcome.providerId} />
            {outcome.providerId === 'bakewithyen' && (
              <span className="muted"> search is limited here — pasting a product URL works best</span>
            )}
            {outcome.error && <span className="error-text">search failed: {outcome.error}</span>}
          </div>
          {outcome.results?.length === 0 && <div className="muted">No matches.</div>}
          {outcome.results?.slice(0, 8).map((result, i) => {
            const selected = picks.get(result.providerId);
            const isSelected = selected ? sameResult(selected, result) : false;
            const pack = isSelected ? selected! : result;
            const estUnit =
              pack.price != null && pack.packQty && pack.packUnit
                ? formatUnitPrice(...toUnitPrice(pack.price, pack.packQty, pack.packUnit))
                : null;
            return (
              <div
                key={`${result.externalId}-${result.variantId}-${i}`}
                className={`search-result${isSelected ? ' selected' : ''}`}
                onClick={() => toggle(result)}
              >
                {result.imageUrl && <img src={result.imageUrl} alt="" />}
                <div className="grow">
                  <div className="title">{result.title}</div>
                  <span className="muted">
                    {result.packQty && result.packUnit
                      ? `pack: ${result.packQty}${result.packUnit === 'pcs' ? ' pcs' : result.packUnit}`
                      : 'pack size not detected'}
                    {estUnit ? ` · ≈${estUnit}` : ''}
                    {' · '}
                  </span>
                  <a
                    className="muted"
                    href={result.url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    view on site ↗
                  </a>
                  {isSelected && (
                    <div style={{ marginTop: 4 }} onClick={(e) => e.stopPropagation()}>
                      <span className="muted">pack size: </span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        style={{ width: 80 }}
                        value={selected!.packQty ?? ''}
                        onChange={(e) =>
                          setPack(
                            result.providerId,
                            e.target.value ? parseFloat(e.target.value) : undefined,
                            selected!.packUnit ?? 'g',
                          )
                        }
                      />{' '}
                      <select
                        value={selected!.packUnit ?? 'g'}
                        onChange={(e) =>
                          setPack(result.providerId, selected!.packQty, e.target.value as PackUnit)
                        }
                      >
                        {PACK_UNITS.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                {result.price != null && result.currency && (
                  <span className="price-chip">{formatPrice(result.price, result.currency)}</span>
                )}
                <input type="checkbox" checked={isSelected} readOnly />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function toUnitPrice(price: number, qty: number, unit: PackUnit): [number, string] {
  if (unit === 'g') return [price / (qty / 1000), 'kg'];
  if (unit === 'ml') return [price / (qty / 1000), 'l'];
  return [price / qty, unit === 'pcs' ? 'pcs' : unit];
}

function sameResult(a: SearchResult, b: SearchResult): boolean {
  return a.externalId === b.externalId && a.variantId === b.variantId && a.url === b.url;
}
