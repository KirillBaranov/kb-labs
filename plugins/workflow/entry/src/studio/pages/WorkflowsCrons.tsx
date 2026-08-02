/**
 * @module @kb-labs/studio-app/modules/workflows/pages/workflows-crons-page
 * Cron jobs list - standalone page
 */

import * as React from 'react';
import {
  UITable,
  UITag,
  UISpace,
  UITypographyText,
  UIBadge,
  UIIcon,
} from '@kb-labs/sdk/studio';
import { useData } from '@kb-labs/sdk/studio';
import { UICard } from '@kb-labs/sdk/studio';
import { UIPage, UIPageHeader } from '@kb-labs/sdk/studio';

export default function WorkflowsCrons() {
  const { data: cronsData, isLoading } = useData<{ crons: Array<Record<string, unknown>> }>('/exec/api/v1/crons');

  const formatDate = (date?: Date | string) => {
    if (!date) {return '-';}
    return new Date(date).toLocaleString();
  };

  const columns = [
    {
      title: 'Cron ID',
      dataIndex: 'id',
      key: 'id',
      render: (id: string) => (
        <UITypographyText className="typo-body" strong>{id}</UITypographyText>
      ),
    },
    {
      title: 'Schedule',
      dataIndex: 'schedule',
      key: 'schedule',
      render: (schedule: string) => (
        <UISpace className="gap-tight">
          <UIIcon name="ClockCircleOutlined" className="text-secondary" />
          <UITypographyText className="typo-caption" code>{schedule}</UITypographyText>
        </UISpace>
      ),
    },
    {
      title: 'Job Type',
      dataIndex: 'jobType',
      key: 'jobType',
      render: (jobType: string) => (
        <UITypographyText className="typo-body">{jobType}</UITypographyText>
      ),
    },
    {
      title: 'Timezone',
      dataIndex: 'timezone',
      key: 'timezone',
      render: (timezone?: string) => (
        <UITypographyText className="typo-caption">{timezone || 'UTC'}</UITypographyText>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'enabled',
      key: 'enabled',
      render: (enabled: boolean) => (
        <UIBadge variant={enabled ? 'success' : 'default'}>
          {enabled ? 'Enabled' : 'Disabled'}
        </UIBadge>
      ),
    },
    {
      title: 'Last Run',
      dataIndex: 'lastRun',
      key: 'lastRun',
      render: (date?: Date | string) => (
        <UISpace className="gap-tight">
          <UIIcon name="CalendarOutlined" className="text-secondary" />
          <UITypographyText className="typo-caption">{formatDate(date)}</UITypographyText>
        </UISpace>
      ),
    },
    {
      title: 'Next Run',
      dataIndex: 'nextRun',
      key: 'nextRun',
      render: (date?: Date | string) => (
        date ? (
          <UISpace className="gap-tight">
            <UIIcon name="CalendarOutlined" className="text-info" />
            <UITypographyText className="typo-caption">{formatDate(date)}</UITypographyText>
          </UISpace>
        ) : (
          <UITypographyText className="typo-caption text-tertiary">-</UITypographyText>
        )
      ),
    },
    {
      title: 'Plugin',
      dataIndex: 'pluginId',
      key: 'pluginId',
      render: (pluginId?: string) => (
        pluginId ? (
          <UITag color="blue">{pluginId}</UITag>
        ) : (
          <UITypographyText className="typo-caption text-tertiary">-</UITypographyText>
        )
      ),
    },
  ];

  const enabledCount = cronsData?.crons?.filter((c) => c.enabled).length || 0;
  const disabledCount = cronsData?.crons?.filter((c) => !c.enabled).length || 0;

  return (
    <UIPage width="full">
      <UIPageHeader
        title="Cron Jobs"
        description="Scheduled recurring tasks"
        breadcrumbs={[
          { title: 'Home', href: '/' },
          { title: 'Workflows', href: '/workflows' },
          { title: 'Crons' },
        ]}
      />

      {/* Headline stats — compact single-row strip, not a stack of big cards */}
      <UICard styles={{ body: { padding: '18px 24px' } }} style={{ marginBottom: 'var(--spacing-section)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          {[
            { label: 'Total Cron Jobs', value: cronsData?.crons?.length || 0 },
            { label: 'Enabled', value: enabledCount, valueColor: 'var(--success)' },
            { label: 'Disabled', value: disabledCount },
          ].map((metric, i) => (
            <div key={metric.label} style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
              {i > 0 && <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--border-primary)' }} />}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{
                  fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-heading)',
                  fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em',
                  color: metric.valueColor ?? 'var(--text-primary)',
                }}>
                  {metric.value}
                </span>
                <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>{metric.label}</span>
              </div>
            </div>
          ))}
        </div>
      </UICard>

      <UICard>
        <UITable
          dataSource={cronsData?.crons || []}
          columns={columns}
          loading={isLoading}
          rowKey="id"
          pagination={{ pageSize: 20 }}
        />
      </UICard>
    </UIPage>
  );
}
