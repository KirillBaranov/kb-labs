import {
  UICard,
  UIAlert,
  UIBadge,
  UITag,
  UITypographyText,
  UITitle,
  UISpace,
  UIButton,
  UICopyButton,
  UISpin,
  UIIcon,
  UIInput,
  UIList,
  UIListItem,
  UITypographyParagraph,
  UIPage,
  UIPageHeader,
} from '@kb-labs/studio-ui-kit';
import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useDataSources } from '../../../providers/data-sources-provider';
import type { LogRecord } from '@kb-labs/studio-data-client';

function formatDateTime(timestamp: string | number): string {
  const date = new Date(typeof timestamp === 'number' ? timestamp : timestamp);
  return (
    date.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }) +
    '.' +
    date.getMilliseconds().toString().padStart(3, '0')
  );
}

function formatRelativeTime(timestamp: string | number): string {
  const ms = typeof timestamp === 'number' ? timestamp : new Date(timestamp).getTime();
  const seconds = Math.floor((Date.now() - ms) / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function getLevelColor(level: LogRecord['level'] | string): string {
  switch (level) {
    case 'trace':
    case 'debug':
      return 'default';
    case 'info':
      return 'blue';
    case 'warn':
      return 'orange';
    case 'error':
    case 'fatal':
    default:
      return 'red';
  }
}

function getLevelBorderColor(level: LogRecord['level'] | string): string {
  switch (level) {
    case 'trace':
    case 'debug':
      return '#8c8c8c';
    case 'info':
      return '#1890ff';
    case 'warn':
      return '#faad14';
    case 'error':
    case 'fatal':
    default:
      return '#ff4d4f';
  }
}

function StackTrace({ stack }: { stack: string }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <UIButton
          variant="text"
          size="small"
          onClick={() => setExpanded((e) => !e)}
          icon={<UIIcon name={expanded ? 'DownOutlined' : 'RightOutlined'} />}
          style={{ padding: 0, color: '#8c8c8c', fontSize: 12 }}
        >
          Stack Trace
        </UIButton>
      </div>
      {expanded && (
        <UITypographyParagraph
          copyable
          code
          style={{ maxHeight: 320, overflow: 'auto', fontSize: 12, marginBottom: 0 }}
        >
          {stack}
        </UITypographyParagraph>
      )}
    </div>
  );
}

function AllFields({ log }: { log: LogRecord }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const entries = Object.entries(log).filter(
    ([k, v]) => !search || k.includes(search) || String(v).includes(search),
  );

  return (
    <UICard
      title={
        <span onClick={() => setOpen((o) => !o)} style={{ cursor: 'pointer', userSelect: 'none' }}>
          <UIIcon
            name={open ? 'DownOutlined' : 'RightOutlined'}
            style={{ fontSize: 10, marginRight: 6, color: '#8c8c8c' }}
          />
          All Fields ({Object.keys(log).length})
        </span>
      }
    >
      {open && (
        <>
          <UIInput
            placeholder="Search fields..."
            value={search}
            onChange={(value) => setSearch(value)}
            allowClear
            prefix={<UIIcon name="SearchOutlined" style={{ color: '#bfbfbf' }} />}
            style={{ marginBottom: 12 }}
          />
          <div>
            {entries.map(([k, v]) => {
              const strVal = typeof v === 'object' ? JSON.stringify(v) : String(v);
              return (
                <div
                  key={k}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '4px 0',
                    borderBottom: '1px solid #f5f5f5',
                  }}
                >
                  <span
                    style={{
                      color: '#8c8c8c',
                      fontSize: 12,
                      minWidth: 140,
                      flexShrink: 0,
                      fontFamily: 'monospace',
                    }}
                  >
                    {k}
                  </span>
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 12,
                      wordBreak: 'break-all',
                      flex: 1,
                      color: '#262626',
                    }}
                  >
                    {strVal}
                  </span>
                  <UICopyButton value={strVal} size="small" style={{ flexShrink: 0 }} />
                </div>
              );
            })}
            {entries.length === 0 && (
              <UITypographyText type="secondary" style={{ fontSize: 12 }}>
                No fields match "{search}"
              </UITypographyText>
            )}
          </div>
        </>
      )}
    </UICard>
  );
}

export function LogDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const sources = useDataSources();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [log, setLog] = useState<LogRecord | null>(null);
  const [relatedLogs, setRelatedLogs] = useState<LogRecord[]>([]);

  useEffect(() => {
    if (!id) return;

    const loadLog = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await sources.observability.getLog(id, true);
        setLog(response.log);
        setRelatedLogs(response.related || []);
      } catch (err: any) {
        setError(err);
      } finally {
        setLoading(false);
      }
    };

    loadLog();
  }, [id, sources.observability]);

  if (loading) {
    return (
      <UIPage>
        <div style={{ textAlign: 'center', padding: '100px 0' }}>
          <UISpin size="large" tip="Loading log details..." />
        </div>
      </UIPage>
    );
  }

  if (error || !log) {
    return (
      <UIPage>
        <UIPageHeader
          title="Log Not Found"
          description="The requested log could not be found"
          onBack={() => navigate('/observability/logs')}
        />
        <UIAlert
          message={error ? 'Error loading log' : 'Log not found'}
          description={error ? error.message : `Log with ID '${id}' does not exist`}
          variant="error"
          showIcon
        />
      </UIPage>
    );
  }

  const logTraceId = log.traceId as string | undefined;
  const logRequestId = log.requestId as string | undefined;
  const logSessionId = log.sessionId as string | undefined;
  const errorDetails = (log.err || log.error) as
    | { name?: string; message?: string; stack?: string }
    | undefined;
  const hasError = !!errorDetails;
  const borderColor = getLevelBorderColor(log.level);

  const correlationIds: Array<[string, string]> = [
    ['Trace', logTraceId],
    ['Execution', log.executionId as string | undefined],
    ['Request', logRequestId],
    ['Session', logSessionId],
  ].filter((entry): entry is [string, string] => !!entry[1]);

  return (
    <UIPage>
      <UIPageHeader
        title="Log Details"
        description={`Viewing log from ${formatRelativeTime(log.time)}`}
        onBack={() => navigate('/observability/logs')}
        actions={[
          <UICopyButton
            key="copy-link"
            value={window.location.href}
            size="middle"
            label="Copy Link"
          />,
          <UICopyButton
            key="copy-json"
            value={JSON.stringify(log, null, 2)}
            size="middle"
            label="Export JSON"
          />,
        ]}
      />

      {/* Hero card */}
      <UICard
        style={{
          marginBottom: 16,
          borderLeft: `4px solid ${borderColor}`,
          borderRadius: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <UITag color={getLevelColor(log.level)} style={{ margin: 0 }}>
            {log.level.toUpperCase()}
          </UITag>
          <UITypographyText type="secondary" style={{ fontSize: 13 }}>
            {String(log.plugin || log.source || 'unknown')}
          </UITypographyText>
          <UITypographyText type="secondary">·</UITypographyText>
          <UITypographyText type="secondary" style={{ fontSize: 13, fontFamily: 'monospace' }}>
            {formatDateTime(log.time)}
          </UITypographyText>
          <UITypographyText type="secondary" style={{ fontSize: 13 }}>
            ({formatRelativeTime(log.time)})
          </UITypographyText>
        </div>

        <UITitle level={4} style={{ margin: '8px 0 14px' }}>
          {String(log.msg || '(no message)')}
        </UITitle>

        {correlationIds.length > 0 && (
          <UISpace wrap size={4}>
            {correlationIds.map(([label, value]) => (
              <UISpace key={label} size={2} style={{ fontFamily: 'monospace', fontSize: 11 }}>
                <UITypographyText type="secondary" style={{ fontSize: 11 }}>{label}:</UITypographyText>
                <UITypographyText code style={{ fontSize: 11 }}>
                  {value.length > 16 ? `${value.slice(0, 16)}…` : value}
                </UITypographyText>
                <UICopyButton value={value} size="small" />
              </UISpace>
            ))}
          </UISpace>
        )}
      </UICard>

      {/* Error Details */}
      {hasError && (
        <UICard
          style={{ marginBottom: 16 }}
          title={
            <UISpace>
              <UIIcon name="CloseCircleOutlined" style={{ color: '#ff4d4f' }} />
              <span>{errorDetails.name || 'Error'}</span>
            </UISpace>
          }
        >
          {errorDetails.message && (
            <UITypographyText strong style={{ fontSize: 15, display: 'block', marginBottom: 16 }}>
              {errorDetails.message}
            </UITypographyText>
          )}
          {errorDetails.stack && <StackTrace stack={errorDetails.stack} />}
        </UICard>
      )}

      {/* Context / Related Logs */}
      {relatedLogs.length > 0 && (
        <UICard
          style={{ marginBottom: 16 }}
          title={
            <UISpace>
              <UIIcon name="ClockCircleOutlined" />
              <span>Context</span>
              <UIBadge count={relatedLogs.length} style={{ backgroundColor: '#52c41a' }} />
            </UISpace>
          }
        >
          <UIList
            size="small"
            dataSource={relatedLogs}
            rowKey={(rl) => rl.id ?? rl.time}
            renderItem={(rl) => {
              const isCurrent = rl.id === id;
              const timeStr = formatDateTime(rl.time);
              const timePart = timeStr.includes(', ') ? timeStr.split(', ')[1] : timeStr;

              const rowContent = (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '150px 65px 110px 1fr',
                    alignItems: 'center',
                    gap: 8,
                    padding: '4px 0',
                  }}
                >
                  <UITypographyText type="secondary" style={{ fontSize: 11, fontFamily: 'monospace' }}>
                    {timePart}
                  </UITypographyText>
                  <UITag color={getLevelColor(rl.level)} style={{ margin: 0 }}>
                    {rl.level.toUpperCase()}
                  </UITag>
                  <UITypographyText type="secondary" style={{ fontSize: 12 }}>
                    {String(rl.plugin || '—')}
                  </UITypographyText>
                  <UITypographyText
                    style={{ fontSize: 12, fontWeight: isCurrent ? 600 : 400 }}
                    ellipsis={{ tooltip: String(rl.msg || '(no message)') }}
                  >
                    {String(rl.msg || '(no message)')}
                  </UITypographyText>
                </div>
              );

              return (
                <UIListItem
                  style={{
                    padding: '4px 8px',
                    borderLeft: isCurrent ? '3px solid #fa8c16' : '3px solid transparent',
                    background: isCurrent ? '#fffbe6' : undefined,
                    borderRadius: 4,
                  }}
                >
                  {rl.id && !isCurrent ? (
                    <Link
                      to={`/observability/logs/${rl.id}`}
                      style={{ display: 'block', width: '100%', color: 'inherit', textDecoration: 'none' }}
                    >
                      {rowContent}
                    </Link>
                  ) : (
                    rowContent
                  )}
                </UIListItem>
              );
            }}
          />
        </UICard>
      )}

      {/* All Fields */}
      <AllFields log={log} />
    </UIPage>
  );
}
