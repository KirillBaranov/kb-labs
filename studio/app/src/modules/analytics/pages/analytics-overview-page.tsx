import { UIRow, UICol, UIStatistic, UIAlert, UISpace, useUITheme } from '@kb-labs/studio-ui-kit';
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
import { UIText, UITitle, UICard, UIPage, UIPageHeader } from '@kb-labs/studio-ui-kit';
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


/**
 * Analytics Overview Page
 *
 * High-level dashboard showing metrics across all platform adapters:
 * - Total events tracked
 * - Adapter health status
 * - Quick links to detailed views (LLM, Cache, Events, etc.)
 */
export function AnalyticsOverviewPage() {
  const { token } = useUITheme();
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

  return (
    <UIPage width="full">
      <UIPageHeader
        title="Analytics Overview"
        description="High-level metrics across all platform adapters"
      />

      <div style={{ marginTop: 24 }}>
        {/* Overview Stats */}
        <UIRow gutter={[16, 16]}>
          <UICol xs={24} sm={12} lg={6}>
            <UICard>
              <UIStatistic
                title="Total Events"
                value={statsData?.totalEvents ?? 0}
                loading={statsLoading}
                prefix={<ThunderboltOutlined />}
                valueStyle={{ color: 'var(--info)' }}
              />
            </UICard>
          </UICol>
          <UICol xs={24} sm={12} lg={6}>
            <UICard>
              <UIStatistic
                title="Event Types"
                value={statsData ? Object.keys(statsData.byType).length : 0}
                loading={statsLoading}
                prefix={<DatabaseOutlined />}
                valueStyle={{ color: 'var(--success)' }}
              />
            </UICard>
          </UICol>
          <UICol xs={24} sm={12} lg={6}>
            <UICard>
              <UIStatistic
                title="Sources"
                value={statsData ? Object.keys(statsData.bySource).length : 0}
                loading={statsLoading}
                prefix={<CloudOutlined />}
                valueStyle={{ color: 'var(--link)' }}
              />
            </UICard>
          </UICol>
          <UICol xs={24} sm={12} lg={6}>
            <UICard>
              <UIStatistic
                title="Actors"
                value={statsData ? Object.keys(statsData.byActor).length : 0}
                loading={statsLoading}
                prefix={<RocketOutlined />}
                valueStyle={{ color: 'var(--warning)' }}
              />
            </UICard>
          </UICol>
        </UIRow>

        {/* Platform Adapters */}
        <div style={{ marginTop: 32 }}>
          <UITitle level={4}>Platform Adapters</UITitle>
          <UIRow gutter={[16, 16]} style={{ marginTop: 16 }}>
            {/* LLM Adapter */}
            <UICol xs={24} md={12} lg={8}>
              <UICard
                hoverable
                onClick={() => navigate('/analytics/llm')}
                style={{ cursor: 'pointer' }}
              >
                <UISpace direction="vertical" style={{ width: '100%' }} size="large">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <UISpace>
                      <RobotOutlined style={{ fontSize: 24, color: 'var(--info)' }} />
                      <UIText weight="semibold" style={{ fontSize: 16 }}>LLM Usage</UIText>
                    </UISpace>
                    <ArrowRightOutlined style={{ color: token.colorTextTertiary }} />
                  </div>
                  <UIRow gutter={16}>
                    <UICol span={12}>
                      <UIStatistic
                        title="Requests"
                        value={llmStats?.totalRequests ?? 0}
                        valueStyle={{ fontSize: 20 }}
                      />
                    </UICol>
                    <UICol span={12}>
                      <UIStatistic
                        title="Cost"
                        value={llmStats?.totalCost ?? 0}
                        prefix={<DollarOutlined />}
                        precision={2}
                        valueStyle={{ fontSize: 20 }}
                      />
                    </UICol>
                  </UIRow>
                </UISpace>
              </UICard>
            </UICol>

            {/* Embeddings Adapter */}
            <UICol xs={24} md={12} lg={8}>
              <UICard
                hoverable
                onClick={() => navigate('/analytics/embeddings')}
                style={{ cursor: 'pointer' }}
              >
                <UISpace direction="vertical" style={{ width: '100%' }} size="large">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <UISpace>
                      <FileTextOutlined style={{ fontSize: 24, color: 'var(--success)' }} />
                      <UIText weight="semibold" style={{ fontSize: 16 }}>Embeddings</UIText>
                    </UISpace>
                    <ArrowRightOutlined style={{ color: token.colorTextTertiary }} />
                  </div>
                  <UIRow gutter={16}>
                    <UICol span={12}>
                      <UIStatistic
                        title="Requests"
                        value={embeddingsStats?.totalRequests ?? 0}
                        valueStyle={{ fontSize: 20 }}
                      />
                    </UICol>
                    <UICol span={12}>
                      <UIStatistic
                        title="Text Chars"
                        value={embeddingsStats?.totalTextLength ?? 0}
                        valueStyle={{ fontSize: 20 }}
                      />
                    </UICol>
                  </UIRow>
                </UISpace>
              </UICard>
            </UICol>

            {/* VectorStore Adapter */}
            <UICol xs={24} md={12} lg={8}>
              <UICard
                hoverable
                onClick={() => navigate('/analytics/vectorstore')}
                style={{ cursor: 'pointer' }}
              >
                <UISpace direction="vertical" style={{ width: '100%' }} size="large">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <UISpace>
                      <DatabaseOutlined style={{ fontSize: 24, color: 'var(--link)' }} />
                      <UIText weight="semibold" style={{ fontSize: 16 }}>VectorStore</UIText>
                    </UISpace>
                    <ArrowRightOutlined style={{ color: token.colorTextTertiary }} />
                  </div>
                  <UIRow gutter={16}>
                    <UICol span={12}>
                      <UIStatistic
                        title="Searches"
                        value={vectorstoreStats?.searchQueries ?? 0}
                        valueStyle={{ fontSize: 20 }}
                      />
                    </UICol>
                    <UICol span={12}>
                      <UIStatistic
                        title="Avg Score"
                        value={vectorstoreStats?.avgSearchScore ?? 0}
                        precision={2}
                        valueStyle={{ fontSize: 20 }}
                      />
                    </UICol>
                  </UIRow>
                </UISpace>
              </UICard>
            </UICol>

            {/* Cache Adapter */}
            <UICol xs={24} md={12} lg={8}>
              <UICard
                hoverable
                onClick={() => navigate('/analytics/cache')}
                style={{ cursor: 'pointer' }}
              >
                <UISpace direction="vertical" style={{ width: '100%' }} size="large">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <UISpace>
                      <ThunderboltOutlined style={{ fontSize: 24, color: 'var(--warning)' }} />
                      <UIText weight="semibold" style={{ fontSize: 16 }}>Cache</UIText>
                    </UISpace>
                    <ArrowRightOutlined style={{ color: token.colorTextTertiary }} />
                  </div>
                  <UIRow gutter={16}>
                    <UICol span={12}>
                      <UIStatistic
                        title="Hit Rate"
                        value={cacheStats?.hitRate ?? 0}
                        suffix="%"
                        precision={1}
                        valueStyle={{ fontSize: 20, color: cacheStats && cacheStats.hitRate >= 80 ? 'var(--success)' : 'var(--info)' }}
                      />
                    </UICol>
                    <UICol span={12}>
                      <UIStatistic
                        title="Total Gets"
                        value={cacheStats?.totalGets ?? 0}
                        valueStyle={{ fontSize: 20 }}
                      />
                    </UICol>
                  </UIRow>
                </UISpace>
              </UICard>
            </UICol>

            {/* Storage Adapter */}
            <UICol xs={24} md={12} lg={8}>
              <UICard
                hoverable
                onClick={() => navigate('/analytics/storage')}
                style={{ cursor: 'pointer' }}
              >
                <UISpace direction="vertical" style={{ width: '100%' }} size="large">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <UISpace>
                      <SaveOutlined style={{ fontSize: 24, color: 'var(--error)' }} />
                      <UIText weight="semibold" style={{ fontSize: 16 }}>Storage</UIText>
                    </UISpace>
                    <ArrowRightOutlined style={{ color: token.colorTextTertiary }} />
                  </div>
                  <UIRow gutter={16}>
                    <UICol span={12}>
                      <UIStatistic
                        title="Reads"
                        value={storageStats?.readOperations ?? 0}
                        valueStyle={{ fontSize: 20 }}
                      />
                    </UICol>
                    <UICol span={12}>
                      <UIStatistic
                        title="Writes"
                        value={storageStats?.writeOperations ?? 0}
                        valueStyle={{ fontSize: 20 }}
                      />
                    </UICol>
                  </UIRow>
                </UISpace>
              </UICard>
            </UICol>
          </UIRow>
        </div>
      </div>
    </UIPage>
  );
}
