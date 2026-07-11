import { useMemo } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { HistoryPoint, PROVIDER_COLORS } from '../api';

interface Props {
  history: HistoryPoint[];
  /** provider_id per link_id, marketplace links drawn dashed */
  marketplaceLinkIds: Set<number>;
}

/**
 * One line per link (source), all plotted in SGD so every shop shares a
 * comparable axis. Points without a conversion yet are skipped.
 */
export function PriceHistoryChart({ history, marketplaceLinkIds }: Props) {
  const { data, series } = useMemo(() => {
    const converted = history.filter((p) => p.price_sgd != null);
    const seriesKeys = new Map<number, string>(); // link_id -> provider_id
    for (const point of converted) {
      if (!seriesKeys.has(point.link_id)) seriesKeys.set(point.link_id, point.provider_id);
    }
    const byDay = new Map<string, Record<string, number | string>>();
    for (const point of converted) {
      const day = point.scraped_at.slice(0, 10);
      const row = byDay.get(day) ?? { day };
      row[seriesKeys.get(point.link_id)!] = Math.round(point.price_sgd! * 100) / 100;
      byDay.set(day, row);
    }
    return {
      data: [...byDay.values()].sort((a, b) => String(a.day).localeCompare(String(b.day))),
      series: [...seriesKeys.entries()].map(([linkId, providerId]) => ({
        key: providerId,
        color: PROVIDER_COLORS[providerId] ?? '#64748b',
        dashed: marketplaceLinkIds.has(linkId),
      })),
    };
  }, [history, marketplaceLinkIds]);

  if (!data.length) {
    return <p className="muted">No price history yet — it accumulates with each daily fetch.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="day" fontSize={12} />
        <YAxis
          fontSize={12}
          domain={['auto', 'auto']}
          tickFormatter={(v) => `S$${v}`}
          width={70}
        />
        <Tooltip formatter={(value) => [`S$${value}`, undefined]} />
        <Legend />
        {series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            stroke={s.color}
            strokeWidth={2}
            strokeDasharray={s.dashed ? '6 4' : undefined}
            dot={{ r: 2 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
