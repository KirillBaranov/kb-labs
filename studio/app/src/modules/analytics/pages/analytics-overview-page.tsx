import { UIRow, UICol, UIStatistic, UIAlert } from '@kb-labs/studio-ui-kit';
import {
  ThunderboltOutlined,
  DatabaseOutlined,
  CloudOutlined,
  RocketOutlined,
  RobotOutlined,
  FileTextOutlined,
  SaveOutlined,
  ArrowRightOutlined,
  DollarOutlined,
} from '@ant-design/icons';
import { UICard, UIPage, UIPageHeader } from '@kb-labs/studio-ui-kit';
import {
  useAnalyticsStats,
  useAdaptersLLMUsage,
  useAdaptersEmbeddingsUsage,
  useAdaptersVectorStoreUsage,
  useAdaptersCacheUsage,
  useAdaptersStorageUsage,
} from '@kb-labs/studio-data-client';
import { useDataSources } from '../../../providers/data-sources-provider';
import { useNavigate } from 'react-router-dom';
import { AnalyticsSummaryStrip } from '../components/analytics-summary-strip';
import type { ReactNode } from 'react';

interface AdapterCardConfig {
  key: string;
  path: string;
  label: string;
  icon: ReactNode;
  color: string;
  stats: Array<{ title: string; value: number; suffix?: string; precision?: number; prefix?: ReactNode; valueColor?: string }>;
}

/**
 * Analytics Overview Page
 *
 * High-level dashboard showing metrics across all platform adapters:
 * - Total events tracked
 * - Adapter health status
 * - Quick links to detailed views (LLM, Cache, Events, etc.)
 */
export function AnalyticsOverviewPage() {
  const sources = useDataSources();
  const navigate = useNavigate();

  const {
    data: statsData,
    isLoading: statsLoading,
    error: statsError,
    isError: isStatsError,
  } = useAnalyticsStats(sources.analytics);

  // Fetch all adapter stats
  const { data: llmStats } = useAdaptersLLMUsage(sources.adapters);
  const { data: embeddingsStats } = useAdaptersEmbeddingsUsage(sources.adapters);
  const { data: vectorstoreStats } = useAdaptersVectorStoreUsage(sources.adapters);
  const { data: cacheStats } = useAdaptersCacheUsage(sources.adapters);
  const { data: storageStats } = useAdaptersStorageUsage(sources.adapters);

  // Check if analytics is not configured
  const analyticsNotConfigured =
    isStatsError &&
    statsError instanceof Error &&
    statsError.message.includes('not support');

  if (analyticsNotConfigured) {
    return (
      <UIPage>
        <UIPageHeader
          title="Analytics"
          description="Platform-wide analytics and adapter metrics"
        />
        <UIAlert
          message="Analytics Not Configured"
          description="Analytics adapter is not configured. Configure an analytics adapter in kb.config.json to track events and metrics."
          variant="info"
          showIcon
          style={{ marginTop: 16 }}
        />
      </UIPage>
    );
  }

  if (isStatsError) {
    return (
      <UIPage>
        <UIPageHeader title="Analytics" description="Platform-wide analytics" />
        <UIAlert
          message="Failed to Load Analytics"
          description={statsError?.message || 'Unknown error occurred'}
          variant="error"
          showIcon
          style={{ marginTop: 16 }}
        />
      </UIPage>
    );
  }

  const summary = [
    { label: 'Total Events', value: statsData?.totalEvents ?? 0 },
    { label: 'Event Types', value: statsData ? Object.keys(statsData.byType).length : 0 },
    { label: 'Sources', value: statsData ? Object.keys(statsData.bySource).length : 0 },
    { label: 'Actors', value: statsData ? Object.keys(statsData.byActor).length : 0 },
  ];

  const adapters: AdapterCardConfig[] = [
    {
      key: 'llm',
      path: '/analytics/llm',
      label: 'LLM Usage',
      icon: <RobotOutlined />,
      color: 'var(--info)',
      stats: [
        { title: 'Requests', value: llmStats?.totalRequests ?? 0 },
        { title: 'Cost', value: llmStats?.totalCost ?? 0, prefix: <DollarOutlined />, precision: 2 },
      ],
    },
    {
      key: 'embeddings',
      path: '/analytics/embeddings',
      label: 'Embeddings',
      icon: <FileTextOutlined />,
      color: 'var(--success)',
      stats: [
        { title: 'Requests', value: embeddingsStats?.totalRequests ?? 0 },
        { title: 'Text Chars', value: embeddingsStats?.totalTextLength ?? 0 },
      ],
    },
    {
      key: 'vectorstore',
      path: '/analytics/vectorstore',
      label: 'VectorStore',
      icon: <DatabaseOutlined />,
      color: 'var(--link)',
      stats: [
        { title: 'Searches', value: vectorstoreStats?.searchQueries ?? 0 },
        { title: 'Avg Score', value: vectorstoreStats?.avgSearchScore ?? 0, precision: 2 },
      ],
    },
    {
      key: 'cache',
      path: '/analytics/cache',
      label: 'Cache',
      icon: <ThunderboltOutlined />,
      color: 'var(--warning)',
      stats: [
        {
          title: 'Hit Rate', value: cacheStats?.hitRate ?? 0, suffix: '%', precision: 1,
          valueColor: cacheStats && cacheStats.hitRate >= 80 ? 'var(--success)' : 'var(--info)',
        },
        { title: 'Total Gets', value: cacheStats?.totalGets ?? 0 },
      ],
    },
    {
      key: 'storage',
      path: '/analytics/storage',
      label: 'Storage',
      icon: <SaveOutlined />,
      color: 'var(--error)',
      stats: [
        { title: 'Reads', value: storageStats?.readOperations ?? 0 },
        { title: 'Writes', value: storageStats?.writeOperations ?? 0 },
      ],
    },
  ];

  return (
    <UIPage width="full">
      <UIPageHeader
        title="Analytics Overview"
        description="High-level metrics across all platform adapters"
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 8 }}>
        <AnalyticsSummaryStrip metrics={summary} loading={statsLoading} />

        {/* Platform Adapters */}
        <UIRow gutter={[16, 16]}>
          {adapters.map(adapter => {
            const title = (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: adapter.color, fontSize: 15, display: 'flex' }}>{adapter.icon}</span>
                <span>{adapter.label}</span>
              </div>
            );

            return (
              <UICol key={adapter.key} xs={24} md={12} lg={8}>
                <UICard
                  title={title}
                  extra={<ArrowRightOutlined style={{ color: 'var(--text-tertiary)', fontSize: 13 }} />}
                  hoverable
                  onClick={() => navigate(adapter.path)}
                  style={{ cursor: 'pointer', height: '100%' }}
                >
                  <UIRow gutter={16}>
                    {adapter.stats.map(stat => (
                      <UICol span={12} key={stat.title}>
                        <UIStatistic
                          title={stat.title}
                          value={stat.value}
                          suffix={stat.suffix}
                          precision={stat.precision}
                          prefix={stat.prefix}
                          valueStyle={{ fontSize: 18, color: stat.valueColor }}
                        />
                      </UICol>
                    ))}
                  </UIRow>
                </UICard>
              </UICol>
            );
          })}
        </UIRow>
      </div>
    </UIPage>
  );
}
