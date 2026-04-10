import * as React from 'react';
import { useState, useMemo, useCallback } from 'react';
import { UITag, UIBadge, UIFlex, UIInput, UITypographyText } from '@kb-labs/studio-ui-kit';
import type { DevToolsChannel, MFEvent, EventBusEvent } from '@kb-labs/studio-devtools';
import { useDevToolsStore } from '@/hooks/use-devtools-store';
import styles from './devtools-log-feed.module.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LogEntry {
  id: string;
  channelId: string;
  channelLabel: string;
  timestamp: number;
  status: 'success' | 'warning' | 'error' | 'pending';
  summary: string;
  meta?: string;
  raw: unknown;
}

// ---------------------------------------------------------------------------
// Row builders
// ---------------------------------------------------------------------------

function buildMFEntry(event: MFEvent, channelLabel: string): LogEntry {
  let status: LogEntry['status'] = 'pending';
  if (event.status === 'success') {status = 'success';}
  else if (event.status === 'warning') {status = 'warning';}
  else if (event.status === 'error') {status = 'error';}

  return {
    id: event.id,
    channelId: 'mf-events',
    channelLabel,
    timestamp: event.startedAt,
    status,
    summary: `${event.remoteName} / ${event.exposedModule}`,
    meta: event.durationMs != null ? `${event.durationMs}ms` : undefined,
    raw: event,
  };
}

function buildEventBusEntry(event: EventBusEvent, channelLabel: string): LogEntry {
  return {
    id: event.id,
    channelId: 'eventbus',
    channelLabel,
    timestamp: event.timestamp,
    status: 'success',
    summary: event.event,
    meta: event.sourcePluginId !== '' ? event.sourcePluginId : undefined,
    raw: event,
  };
}

function buildGenericEntry(event: unknown, channelId: string, channelLabel: string): LogEntry {
  const id = (event as { id?: string }).id ?? `${Date.now()}-${Math.random()}`;
  const timestamp =
    (event as { timestamp?: number }).timestamp ??
    (event as { startedAt?: number }).startedAt ??
    Date.now();
  return {
    id, channelId, channelLabel, timestamp,
    status: 'success',
    summary: JSON.stringify(event).slice(0, 80),
    raw: event,
  };
}

function channelToEntries(channel: DevToolsChannel): LogEntry[] {
  return (channel.getEvents() as unknown[]).map((e) => {
    if (channel.id === 'mf-events') {return buildMFEntry(e as MFEvent, channel.label);}
    if (channel.id === 'eventbus') {return buildEventBusEntry(e as EventBusEvent, channel.label);}
    return buildGenericEntry(e, channel.id, channel.label);
  });
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<LogEntry['status'], string> = {
  success: 'ok',
  warning: 'warn',
  error: 'error',
  pending: '...',
};

function StatusBadge({ status }: { status: LogEntry['status'] }) {
  const cls = {
    success: styles.statusSuccess,
    warning: styles.statusWarning,
    error: styles.statusError,
    pending: styles.statusPending,
  }[status];
  return <span className={`${styles.statusBadge} ${cls}`}>{STATUS_LABEL[status]}</span>;
}

// ---------------------------------------------------------------------------
// Expanded detail
// ---------------------------------------------------------------------------

function ExpandedDetail({ entry }: { entry: LogEntry }) {
  if (entry.channelId === 'mf-events') {
    const mf = entry.raw as MFEvent;
    return (
      <div className={styles.detail}>
        {mf.isDefaultUndefined && (
          <UITag color="orange" style={{ marginBottom: 8 }}>
            Missing default export — add <code>export default</code> to the component
          </UITag>
        )}
        {mf.error && (
          <pre className={styles.detailPre}>
            {mf.error.message}
            {mf.error.cause ? `\n\nCause: ${mf.error.cause}` : ''}
          </pre>
        )}
        {!mf.isDefaultUndefined && !mf.error && (
          <UITypographyText type="secondary" style={{ fontSize: 12 }}>
            attempt {mf.attempt}
          </UITypographyText>
        )}
      </div>
    );
  }

  if (entry.channelId === 'eventbus') {
    const eb = entry.raw as EventBusEvent;
    return (
      <div className={styles.detail}>
        <pre className={styles.detailPre}>
          {JSON.stringify(eb.payload, null, 2)}
        </pre>
      </div>
    );
  }

  return (
    <div className={styles.detail}>
      <pre className={styles.detailPre}>
        {JSON.stringify(entry.raw, null, 2)}
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Log row
// ---------------------------------------------------------------------------

function LogRow({ entry }: { entry: LogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail =
    entry.channelId === 'mf-events'
      ? !!(entry.raw as MFEvent).error || !!(entry.raw as MFEvent).isDefaultUndefined
      : entry.channelId === 'eventbus';

  const time = new Date(entry.timestamp).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  const rowStatusCls = entry.status === 'error' ? styles.rowError
    : entry.status === 'warning' ? styles.rowWarning
    : entry.status === 'pending' ? styles.rowPending
    : '';

  return (
    <>
      <div
        className={`${styles.row} ${rowStatusCls} ${hasDetail ? styles.clickable : ''} ${expanded ? styles.expanded : ''}`}
        onClick={hasDetail ? () => setExpanded((v) => !v) : undefined}
      >
        <UIFlex align="center" gap={8}>
          <span style={{ fontSize: 10, width: 8, color: 'var(--text-secondary)', flexShrink: 0 }}>
            {hasDetail ? (expanded ? '▼' : '▶') : ''}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', width: 64, flexShrink: 0 }}>
            {time}
          </span>
          <UITag
            color={entry.channelId === 'mf-events' ? 'blue' : 'purple'}
            style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', flexShrink: 0 }}
          >
            {entry.channelLabel}
          </UITag>
          <StatusBadge status={entry.status} />
          <span style={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>
            {entry.summary}
            {(entry.raw as MFEvent).isDefaultUndefined && (
              <UITag color="orange" style={{ marginLeft: 6, fontSize: 10 }}>default=undefined</UITag>
            )}
          </span>
          {entry.meta && (
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', flexShrink: 0 }}>
              {entry.meta}
            </span>
          )}
        </UIFlex>
      </div>
      {expanded && hasDetail && <ExpandedDetail entry={entry} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main log feed
// ---------------------------------------------------------------------------

export function DevToolsLogFeed() {
  const { channels, clear } = useDevToolsStore();
  const [activeChannel, setActiveChannel] = useState<string>('all');
  const [search, setSearch] = useState('');

  const allEntries = useMemo<LogEntry[]>(() => {
    const entries: LogEntry[] = [];
    channels.forEach((ch) => entries.push(...channelToEntries(ch)));
    return entries.sort((a, b) => a.timestamp - b.timestamp);
  }, [channels]);

  const filtered = useMemo(() => {
    let result = activeChannel === 'all'
      ? allEntries
      : allEntries.filter((e) => e.channelId === activeChannel);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((e) =>
        e.summary.toLowerCase().includes(q) ||
        e.channelLabel.toLowerCase().includes(q) ||
        (e.meta ?? '').toLowerCase().includes(q),
      );
    }
    return result;
  }, [allEntries, activeChannel, search]);

  const errorCount = allEntries.filter((e) => e.status === 'error' || e.status === 'warning').length;

  const countFor = useCallback(
    (id: string) => id === 'all' ? allEntries.length : allEntries.filter((e) => e.channelId === id).length,
    [allEntries],
  );

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <UIFlex align="center" gap={4} className={styles.toolbarTitle}>
          <UITypographyText strong style={{ fontSize: 12 }}>DevTools</UITypographyText>
          {errorCount > 0 && <UIBadge count={errorCount} size="small" />}
        </UIFlex>

        <UIInput
          className={styles.toolbarSearch}
          placeholder="Search..."
          value={search}
          onChange={(value) => setSearch(value)}
          allowClear
          size="small"
        />

        <div className={styles.toolbarChips}>
          <UITag
            className={styles.chip}
            color={activeChannel === 'all' ? 'blue' : undefined}
            onClick={() => setActiveChannel('all')}
          >
            All{countFor('all') > 0 ? ` ×${countFor('all')}` : ''}
          </UITag>
          {channels.map((ch) => (
            <UITag
              key={ch.id}
              className={styles.chip}
              color={activeChannel === ch.id ? 'blue' : undefined}
              onClick={() => setActiveChannel(ch.id)}
            >
              {ch.label}{countFor(ch.id) > 0 ? ` ×${countFor(ch.id)}` : ''}
            </UITag>
          ))}
        </div>

        <button className={styles.clearBtn} onClick={clear}>Clear</button>
      </div>

      <div className={styles.logList}>
        {filtered.length === 0 ? (
          <div className={styles.empty}>
            <UITypographyText type="secondary" style={{ fontSize: 12 }}>
              {allEntries.length === 0
                ? 'No events captured yet. Navigate to a plugin page to see MF events.'
                : 'No events match the current filter.'}
            </UITypographyText>
          </div>
        ) : (
          filtered.map((entry) => <LogRow key={entry.id} entry={entry} />)
        )}
      </div>
    </div>
  );
}
