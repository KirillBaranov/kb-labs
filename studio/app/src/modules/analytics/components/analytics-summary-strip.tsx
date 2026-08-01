import { UICard } from '@kb-labs/studio-ui-kit';
import { formatNumber } from '../utils/formatters';

export interface SummaryMetric {
  label: string;
  value: string | number;
  /** Override the value color (e.g. red for error counts) — defaults to text-primary */
  valueColor?: string;
}

interface AnalyticsSummaryStripProps {
  metrics: SummaryMetric[];
  loading?: boolean;
}

/**
 * Compact, single-row metrics strip — same shape as the dashboard's
 * PlatformPulse widget. Replaces the old grid of big icon-badge cards
 * (UIMetricCard) that every analytics page used to open with.
 */
export function AnalyticsSummaryStrip({ metrics, loading }: AnalyticsSummaryStripProps) {
  return (
    <UICard styles={{ body: { padding: '18px 24px' } }} loading={loading}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
        {metrics.map((metric, i) => (
          <div key={metric.label} style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            {i > 0 && <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--border-primary)' }} />}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{
                fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-heading)',
                fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em',
                color: metric.valueColor ?? 'var(--text-primary)',
              }}>
                {typeof metric.value === 'number' ? formatNumber(metric.value) : metric.value}
              </span>
              <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>{metric.label}</span>
            </div>
          </div>
        ))}
      </div>
    </UICard>
  );
}
