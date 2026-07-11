import { PROVIDER_COLORS } from '../api';

export const PROVIDER_LABELS: Record<string, string> = {
  redman: 'RedMan',
  bakeking: 'Bake King',
  fairprice: 'FairPrice',
  bakewithyen: 'Bake With Yen',
  shengsiong: 'Sheng Siong',
  coldstorage: 'Cold Storage',
};

export function ProviderTag({ id }: { id: string }) {
  return (
    <span className="provider-tag" style={{ background: PROVIDER_COLORS[id] ?? '#64748b' }}>
      {PROVIDER_LABELS[id] ?? id}
    </span>
  );
}
