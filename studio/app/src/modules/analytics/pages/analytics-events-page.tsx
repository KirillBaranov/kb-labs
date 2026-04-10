import { useState, useMemo, useCallback } from 'react';
import { UITable, UIAlert, UISelect, UISpace, UIButton, UIDrawer, UIDescriptions, UIDescriptionsItem, UITag, UITooltip, UIRangePicker, UIText, UICard, UIPage, UIPageHeader } from '@kb-labs/studio-ui-kit';
import {
  ReloadOutlined,
  ClearOutlined,
} from '@ant-design/icons';
import {
  useAnalyticsEvents,
  useAnalyticsStats,
} from '@kb-labs/studio-data-client';
import { useDataSources } from '../../../providers/data-sources-provider';
import type { AnalyticsEvent } from '@kb-labs/studio-data-client';
import { type Dayjs } from 'dayjs';

const PAGE_SIZE = 50;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);
  if (days > 0) {return `${days}d ago`;}
  if (hours > 0) {return `${hours}h ago`;}
  if (minutes > 0) {return `${minutes}m ago`;}
  return 'just now';
}

function formatAbsoluteTime(isoString: string): string {
  return new Date(isoString).toLocaleString();
}

function getActorColor(actorType: 'user' | 'agent' | 'ci'): string {
  switch (actorType) {
    case 'user': return 'blue';
    case 'agent': return 'purple';
    case 'ci': return 'orange';
    default: return 'default';
  }
}

function getTypeColor(type: string): string {
  if (type.startsWith('llm.')) {return 'volcano';}
  if (type.startsWith('mind.')) {return 'geekblue';}
  if (type.startsWith('workflow.')) {return 'green';}
  if (type.startsWith('embeddings.')) {return 'cyan';}
  if (type.startsWith('vectorstore.')) {return 'purple';}
  if (type.startsWith('commit.')) {return 'gold';}
  if (type.startsWith('plugin.')) {return 'magenta';}
  return 'default';
}

// ─── Event Detail Drawer ──────────────────────────────────────────────────────

interface EventDrawerProps {
  event: AnalyticsEvent | null;
  onClose: () => void;
}

function EventDrawer({ event, onClose }: EventDrawerProps) {
  if (!event) {return null;}

  return (
    <UIDrawer
      title={
        <UISpace>
          <UITag color={getTypeColor(event.type)}>{event.type}</UITag>
        </UISpace>
      }
      open={!!event}
      onClose={onClose}
      width={520}
      styles={{ body: { padding: '16px 24px' } }}
    >
      <UIDescriptions column={1} size="small" bordered style={{ marginBottom: 20 }}>
        <UIDescriptionsItem label="Time">
          <UITooltip title={event.ts}>
            {formatAbsoluteTime(event.ts)}
          </UITooltip>
        </UIDescriptionsItem>
        <UIDescriptionsItem label="Source">
          {event.source.product} <UIText color="secondary">v{event.source.version}</UIText>
        </UIDescriptionsItem>
        {event.actor && (
          <UIDescriptionsItem label="Actor">
            <UITag color={getActorColor(event.actor.type)}>
              {event.actor.name || event.actor.type}
            </UITag>
            {event.actor.id && (
              <UIText color="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                {event.actor.id}
              </UIText>
            )}
          </UIDescriptionsItem>
        )}
        <UIDescriptionsItem label="Run ID">
          <UIText style={{ fontFamily: 'monospace', fontSize: 12 }}>{event.runId}</UIText>
        </UIDescriptionsItem>
        <UIDescriptionsItem label="Ingest">
          <UIText color="secondary" style={{ fontSize: 12 }}>
            {formatAbsoluteTime(event.ingestTs)}
          </UIText>
        </UIDescriptionsItem>
      </UIDescriptions>

      {!!event.payload && (
        <div style={{ marginBottom: 20 }}>
          <UIText weight="semibold" style={{ display: 'block', marginBottom: 8 }}>
            Payload
          </UIText>
          <pre
            style={{
              background: 'var(--color-fill-quaternary, #f5f5f5)',
              borderRadius: 6,
              padding: '10px 14px',
              fontSize: 12,
              lineHeight: 1.6,
              overflowX: 'auto',
              maxHeight: 320,
              overflowY: 'auto',
              margin: 0,
            }}
          >
            {JSON.stringify(event.payload, null, 2)}
          </pre>
        </div>
      )}

      {event.ctx && Object.keys(event.ctx).length > 0 && (
        <div>
          <UIText weight="semibold" style={{ display: 'block', marginBottom: 8 }}>
            Context
          </UIText>
          <pre
            style={{
              background: 'var(--color-fill-quaternary, #f5f5f5)',
              borderRadius: 6,
              padding: '10px 14px',
              fontSize: 12,
              lineHeight: 1.6,
              overflowX: 'auto',
              maxHeight: 200,
              overflowY: 'auto',
              margin: 0,
            }}
          >
            {JSON.stringify(event.ctx, null, 2)}
          </pre>
        </div>
      )}
    </UIDrawer>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function AnalyticsEventsPage() {
  const sources = useDataSources();

  // ── Filter state
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedSource, setSelectedSource] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);

  // ── Drawer state
  const [selectedEvent, setSelectedEvent] = useState<AnalyticsEvent | null>(null);

  // ── Determine if any filter is active (disables auto-refresh for live tail)
  const hasFilters = selectedTypes.length > 0 || !!selectedSource || !!dateRange;

  // ── Build query
  const query = useMemo(() => ({
    type: selectedTypes.length > 0 ? selectedTypes : undefined,
    source: selectedSource,
    from: dateRange ? dateRange[0].toISOString() : undefined,
    to: dateRange ? dateRange[1].endOf('day').toISOString() : undefined,
    limit,
  }), [selectedTypes, selectedSource, dateRange, limit]);

  const {
    data: eventsData,
    isLoading: eventsLoading,
    isError: isEventsError,
    error: eventsError,
    refetch,
    dataUpdatedAt,
  } = useAnalyticsEvents(sources.analytics, query);

  // ── Stats for filter options
  const { data: statsData } = useAnalyticsStats(sources.analytics);

  const typeOptions = useMemo(() =>
    Object.keys(statsData?.byType ?? {})
      .sort()
      .map((t) => ({ label: t, value: t })),
    [statsData]
  );

  const sourceOptions = useMemo(() =>
    Object.keys(statsData?.bySource ?? {})
      .sort()
      .map((s) => ({ label: s, value: s })),
    [statsData]
  );

  // ── Handlers
  const handleClearFilters = useCallback(() => {
    setSelectedTypes([]);
    setSelectedSource(undefined);
    setDateRange(null);
    setLimit(PAGE_SIZE);
  }, []);

  const handleLoadMore = useCallback(() => {
    setLimit((prev) => prev + PAGE_SIZE);
  }, []);

  const handleRowClick = useCallback((record: AnalyticsEvent) => {
    setSelectedEvent(record);
  }, []);

  // ── Error: analytics not configured
  const analyticsNotConfigured =
    isEventsError &&
    eventsError instanceof Error &&
    eventsError.message.includes('not support');

  if (analyticsNotConfigured) {
    return (
      <UIPage>
        <UIPageHeader title="Event Log" description="Platform event stream" />
        <UIAlert
          message="Analytics Not Configured"
          description="Configure an analytics adapter in kb.config.json to view events."
          variant="info"
          showIcon
        />
      </UIPage>
    );
  }

  if (isEventsError) {
    return (
      <UIPage>
        <UIPageHeader title="Event Log" description="Platform event stream" />
        <UIAlert
          message="Failed to load events"
          description={eventsError instanceof Error ? eventsError.message : 'Unknown error'}
          variant="error"
          showIcon
        />
      </UIPage>
    );
  }

  const events = eventsData?.events ?? [];
  const total = eventsData?.total ?? 0;
  const hasMore = eventsData?.hasMore ?? false;

  const lastUpdated = dataUpdatedAt
    ? formatRelativeTime(new Date(dataUpdatedAt).toISOString())
    : null;

  return (
    <UIPage width="full">
      <UIPageHeader
        title="Event Log"
        description={
          hasFilters
            ? `${total.toLocaleString()} events matching filters`
            : `Live tail · auto-refresh every 30s${lastUpdated ? ` · updated ${lastUpdated}` : ''}`
        }
      />

      <UICard style={{ marginBottom: 16 }}>
        <UISpace wrap size="small" style={{ width: '100%', justifyContent: 'space-between' }}>
          <UISpace wrap size="small">
            <UISelect
              mode="multiple"
              placeholder="Event type"
              value={selectedTypes}
              onChange={(v) => setSelectedTypes(v as string[])}
              options={typeOptions}
              style={{ minWidth: 200 }}
              maxTagCount={2}
              allowClear
            />
            <UISelect
              placeholder="Source"
              value={selectedSource}
              onChange={(v) => setSelectedSource(v as string | undefined)}
              options={sourceOptions}
              style={{ width: 140 }}
              allowClear
            />
            <UIRangePicker
              value={dateRange}
              onChange={(dates) => {
                if (dates && dates[0] && dates[1]) {
                  setDateRange([dates[0], dates[1]]);
                } else {
                  setDateRange(null);
                }
              }}
              format="DD/MM/YYYY"
              allowClear
            />
            {hasFilters && (
              <UIButton
                icon={<ClearOutlined />}
                onClick={handleClearFilters}
                size="middle"
              >
                Clear
              </UIButton>
            )}
          </UISpace>
          <UIButton
            icon={<ReloadOutlined />}
            onClick={() => refetch()}
            loading={eventsLoading}
            size="middle"
          >
            Refresh
          </UIButton>
        </UISpace>
      </UICard>

      <UICard>
        <UITable<AnalyticsEvent>
          dataSource={events}
          rowKey="id"
          loading={eventsLoading}
          pagination={false}
          size="small"
          onRow={(record) => ({
            onClick: () => handleRowClick(record),
            style: { cursor: 'pointer' },
          })}
          columns={[
            {
              title: 'Time',
              dataIndex: 'ts',
              key: 'ts',
              width: 100,
              render: (ts: string) => (
                <UITooltip title={formatAbsoluteTime(ts)}>
                  <UIText color="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                    {formatRelativeTime(ts)}
                  </UIText>
                </UITooltip>
              ),
            },
            {
              title: 'Type',
              dataIndex: 'type',
              key: 'type',
              render: (type: string) => (
                <UITag color={getTypeColor(type)} style={{ fontFamily: 'monospace', fontSize: 11 }}>
                  {type}
                </UITag>
              ),
            },
            {
              title: 'Source',
              dataIndex: 'source',
              key: 'source',
              width: 100,
              render: (source: { product: string; version: string }) => (
                <UITag>{source.product}</UITag>
              ),
            },
            {
              title: 'Actor',
              dataIndex: 'actor',
              key: 'actor',
              width: 120,
              render: (actor?: { type: 'user' | 'agent' | 'ci'; name?: string }) =>
                actor ? (
                  <UITag color={getActorColor(actor.type)}>
                    {actor.name || actor.type}
                  </UITag>
                ) : (
                  <UIText color="secondary">—</UIText>
                ),
            },
            {
              title: 'Run ID',
              dataIndex: 'runId',
              key: 'runId',
              width: 110,
              render: (runId: string) => (
                <UIText color="secondary" style={{ fontSize: 11, fontFamily: 'monospace' }}>
                  {runId ? runId.slice(0, 10) : '—'}
                </UIText>
              ),
            },
          ]}
        />
        {hasMore ? (
          <div style={{ textAlign: 'center', paddingTop: 8 }}>
            <UIButton onClick={handleLoadMore} loading={eventsLoading}>
              Load {PAGE_SIZE} more
            </UIButton>
            <UIText color="secondary" style={{ marginLeft: 12, fontSize: 12 }}>
              Showing {events.length} of {total.toLocaleString()}
            </UIText>
          </div>
        ) : (
          <div style={{ textAlign: 'center', paddingTop: 4 }}>
            <UIText color="secondary" style={{ fontSize: 12 }}>
              {total > 0
                ? `All ${total.toLocaleString()} events loaded`
                : 'No events found'}
            </UIText>
          </div>
        )}
      </UICard>

      <EventDrawer event={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </UIPage>
  );
}
