import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, CATEGORIES, CATEGORY_LABELS, Category, SearchResult } from '../api';
import { SourceSearchPanel } from '../components/SourceSearchPanel';

export function AddProduct() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<Category>('flour');
  const [brand, setBrand] = useState('');
  const [variantDesc, setVariantDesc] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [picks, setPicks] = useState<SearchResult[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const { id } = await api.createProduct({
        name: name.trim(),
        category,
        brand: brand.trim() || undefined,
        variant_desc: variantDesc.trim() || undefined,
        target_price: targetPrice ? parseFloat(targetPrice) : undefined,
        links: picks,
      });
      navigate(`/products/${id}`);
    } catch (err) {
      setError(String(err));
      setSaving(false);
    }
  };

  return (
    <>
      <div className="card wizard-step">
        <h3 style={{ marginTop: 0 }}>1. Describe the ingredient you want to track</h3>
        <div className="form-grid">
          <div>
            <label>Name *</label>
            <input
              placeholder="e.g. plain flour, unsalted butter, instant yeast"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label>Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Brand</label>
            <input placeholder="e.g. Prima, SCS, RedMan" value={brand} onChange={(e) => setBrand(e.target.value)} />
          </div>
          <div>
            <label>Variant</label>
            <input placeholder="e.g. unbleached, 1kg pack" value={variantDesc} onChange={(e) => setVariantDesc(e.target.value)} />
          </div>
          <div>
            <label>Target price (SGD, optional — alerts fire at or below this)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="e.g. 2.50"
              value={targetPrice}
              onChange={(e) => setTargetPrice(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="card wizard-step">
        <h3 style={{ marginTop: 0 }}>2. Find it at each shop and select the exact match</h3>
        <SourceSearchPanel onSelectionChange={setPicks} initialQuery={name} />
      </div>

      <div className="card wizard-step">
        <h3 style={{ marginTop: 0 }}>3. Save</h3>
        <p className="muted">
          {picks.length
            ? `${picks.length} shop link${picks.length > 1 ? 's' : ''} selected — prices are fetched immediately after saving.`
            : 'You can save without links and attach shops later from the product page.'}
        </p>
        {error && <p className="error-text">{error}</p>}
        <button className="primary" onClick={save} disabled={saving || !name.trim()}>
          {saving ? 'Saving…' : 'Save product'}
        </button>
      </div>
    </>
  );
}
