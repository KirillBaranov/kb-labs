import {
  UICard,
  UIAlert,
  UIBadge,
  UITag,
  UITypographyText,
  UITypographyParagraph,
  UISpace,
  UIButton,
  UIDescriptions,
  UIDescriptionsItem,
  UITooltip,
  UIMessage,
  UISpin,
  UITimeline,
  UIEmptyState,
  UIIcon,
} from '@kb-labs/studio-ui-kit';
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDataSources } from '../../../providers/data-sources-provider';
import type { LogRecord } from '@kb-labs/studio-data-client';
import { UIPage, UIPageHeader } from '@kb-labs/studio-ui-kit';

/**
 * Format timestamp to full datetime with milliseconds
 */
function formatDateTime(timestamp: string | number): string {
  const date = new Date(typeof timestamp === 'number' ? timestamp : timestamp);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }) + '.' + date.getMilliseconds().toString().padStart(3, '0');
}

/**
 * Format relative time (e.g., "2 minutes ago")
 */
function formatRelativeTime(timestamp: string | number): string {
  const ms = typeof timestamp === 'number' ? timestamp : new Date(timestamp).getTime();
  const seconds = Math.floor((Date.now() - ms) / 1000);

  if (seconds < 60) {return `${seconds}s ago`;}
  if (seconds < 3600) {return `${Math.floor(seconds / 60)}m ago`;}
  if (seconds < 86400) {return `${Math.floor(seconds / 3600)}h ago`;}
  return `${Math.floor(seconds / 86400)}d ago`;
}

/**
 * Get log level icon
 */
function getLevelIcon(level: LogRecord['level'] | string) {
  switch (level) {
    case 'trace':
    case 'debug':
      return <UIIcon name="BugOutlined" style={{ fontSize: 20, color: '#8c8c8c' }} />;
    case 'info':
      return <UIIcon name="InfoCircleOutlined" style={{ fontSize: 20, color: '#1890ff' }} />;
    case 'warn':
      return <UIIcon name="WarningOutlined" style={{ fontSize: 20, color: '#faad14' }} />;
    case 'error':
    case 'fatal':
    default:
      return <UIIcon name="CloseCircleOutlined" style={{ fontSize: 20, color: '#ff4d4f' }} />;
  }
}

/**
 * Get log level tag color
 */
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

/**
 * Copy text to clipboard
 */
function copyToClipboard(text: string, label: string) {
  navigator.clipboard.writeText(text);
  UIMessage.success(`${label} copied to clipboard`);
}

/**
 * Log Detail Page
 *
 * Shows detailed view of a single log with:
 * - Full log context (message, level, source, timestamp)
 * - Error details (stack trace if available)
 * - Related logs timeline (based on correlation IDs)
 * - All log metadata fields
 */
export function LogDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const sources = useDataSources();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [log, setLog] = useState<LogRecord | null>(null);
  const [relatedLogs, setRelatedLogs] = useState<LogRecord[]>([]);
  const [correlationKeys, setCorrelationKeys] = useState<any>(null);

  useEffect(() => {
    if (!id) {return;}

    const loadLog = async () => {
      setLoading(true);
      setError(null);

      try {
        // Fetch log with related logs
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

  // Load correlation keys separately if we have the log
  useEffect(() => {
    if (!id || !log) {return;}

    const loadRelated = async () => {
      try {
        const response = await sources.observability.getRelatedLogs(id);
        setCorrelationKeys(response.correlationKeys);
      } catch (err) {
        // Silent fail - correlation keys are nice-to-have
        console.error('Failed to load correlation keys:', err);
      }
    };

    loadRelated();
  }, [id, log, sources.observability]);

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

  // Extract correlation ID fields (not part of LogRecord type, accessed via index signature)
  const logTraceId = log.traceId as string | undefined;
  const logRequestId = log.requestId as string | undefined;
  const logSessionId = log.sessionId as string | undefined;

  // Extract error details if present
  const errorDetails = (log.err || log.error) as { name?: string; message?: string; stack?: string } | undefined;
  const hasError = !!errorDetails;

  // Build metadata fields (exclude standard fields and error)
  const metadataFields: Record<string, unknown> = { ...log };
  delete metadataFields['time'];
  delete metadataFields['level'];
  delete metadataFields['msg'];
  delete metadataFields['plugin'];
  delete metadataFields['err'];
  delete metadataFields['error'];
  delete metadataFields['traceId'];
  delete metadataFields['executionId'];
  delete metadataFields['requestId'];
  delete metadataFields['sessionId'];

  return (
    <UIPage>
      <UIPageHeader
        title="Log Details"
        description={`Viewing log from ${formatRelativeTime(log.time)}`}
        onBack={() => navigate('/observability/logs')}
        actions={[
          <UIButton
            key="copy-link"
            icon={<UIIcon name="LinkOutlined" />}
            onClick={() => copyToClipboard(window.location.href, 'Link')}
          >
            Copy Link
          </UIButton>,
          <UIButton
            key="copy-json"
            icon={<UIIcon name="CopyOutlined" />}
            onClick={() => copyToClipboard(JSON.stringify(log, null, 2), 'JSON')}
          >
            Export JSON
          </UIButton>,
        ]}
      />

      {/* Log Overview Card */}
      <UICard
        style={{ marginBottom: 16 }}
        title={
          <UISpace>
            {getLevelIcon(log.level)}
            <span>Log Overview</span>
            <UITag color={getLevelColor(log.level)}>{log.level.toUpperCase()}</UITag>
          </UISpace>
        }
      >
        <UIDescriptions column={2} bordered>
          <UIDescriptionsItem label="Timestamp">
            <UISpace>
              <UIIcon name="ClockCircleOutlined" />
              <UITypographyText code>{formatDateTime(log.time)}</UITypographyText>
              <UITypographyText type="secondary">({formatRelativeTime(log.time)})</UITypographyText>
            </UISpace>
          </UIDescriptionsItem>

          <UIDescriptionsItem label="Source">
            <UITag color="purple">{String(log.plugin || log.source || 'unknown')}</UITag>
          </UIDescriptionsItem>

          <UIDescriptionsItem label="Message" span={2}>
            <UITypographyText strong style={{ fontSize: 14 }}>
              {String(log.msg || '(no message)')}
            </UITypographyText>
          </UIDescriptionsItem>

          {/* Correlation IDs */}
          {logTraceId && (
            <UIDescriptionsItem label="Trace ID">
              <UISpace>
                <UITypographyText code>{logTraceId}</UITypographyText>
                <UITooltip title="Copy trace ID">
                  <UIButton
                    size="small"
                    icon={<UIIcon name="CopyOutlined" />}
                    onClick={() => copyToClipboard(logTraceId, 'Trace ID')}
                  />
                </UITooltip>
              </UISpace>
            </UIDescriptionsItem>
          )}

          {Boolean(log.executionId) && (
            <UIDescriptionsItem label="Execution ID">
              <UISpace>
                <UITypographyText code>{String(log.executionId)}</UITypographyText>
                <UITooltip title="Copy execution ID">
                  <UIButton
                    size="small"
                    icon={<UIIcon name="CopyOutlined" />}
                    onClick={() => copyToClipboard(String(log.executionId), 'Execution ID')}
                  />
                </UITooltip>
              </UISpace>
            </UIDescriptionsItem>
          )}

          {logRequestId && (
            <UIDescriptionsItem label="Request ID">
              <UISpace>
                <UITypographyText code>{logRequestId}</UITypographyText>
                <UITooltip title="Copy request ID">
                  <UIButton
                    size="small"
                    icon={<UIIcon name="CopyOutlined" />}
                    onClick={() => copyToClipboard(logRequestId, 'Request ID')}
                  />
                </UITooltip>
              </UISpace>
            </UIDescriptionsItem>
          )}

          {logSessionId && (
            <UIDescriptionsItem label="Session ID">
              <UISpace>
                <UITypographyText code>{logSessionId}</UITypographyText>
                <UITooltip title="Copy session ID">
                  <UIButton
                    size="small"
                    icon={<UIIcon name="CopyOutlined" />}
                    onClick={() => copyToClipboard(logSessionId, 'Session ID')}
                  />
                </UITooltip>
              </UISpace>
            </UIDescriptionsItem>
          )}
        </UIDescriptions>
      </UICard>

      {/* Error Details Card (if error exists) */}
      {hasError && (
        <UICard
          style={{ marginBottom: 16 }}
          title={
            <UISpace>
              <UIIcon name="CloseCircleOutlined" style={{ color: '#ff4d4f' }} />
              <span>Error Details</span>
            </UISpace>
          }
          type="inner"
        >
          <UISpace direction="vertical" style={{ width: '100%' }} size="middle">
            {errorDetails.name && (
              <div>
                <UITypographyText type="secondary">Error Type:</UITypographyText>
                <br />
                <UITag color="red">{errorDetails.name}</UITag>
              </div>
            )}

            {errorDetails.message && (
              <div>
                <UITypographyText type="secondary">Error Message:</UITypographyText>
                <br />
                <UITypographyText strong>{errorDetails.message}</UITypographyText>
              </div>
            )}

            {errorDetails.stack && (
              <div>
                <UITypographyText type="secondary">Stack Trace:</UITypographyText>
                <UITypographyParagraph
                  copyable
                  code
                  style={{
                    marginTop: 8,
                    backgroundColor: '#fafafa',
                    padding: 12,
                    borderRadius: 4,
                    fontSize: 12,
                    fontFamily: 'monospace',
                    whiteSpace: 'pre-wrap',
                    maxHeight: 300,
                    overflow: 'auto',
                  }}
                >
                  {errorDetails.stack}
                </UITypographyParagraph>
              </div>
            )}
          </UISpace>
        </UICard>
      )}

      {/* Related Logs Timeline */}
      <UICard
        style={{ marginBottom: 16 }}
        title={
          <UISpace>
            <UIIcon name="ClockCircleOutlined" />
            <span>Related Logs Timeline</span>
            {relatedLogs.length > 0 && (
              <UIBadge count={relatedLogs.length} style={{ backgroundColor: '#52c41a' }} />
            )}
          </UISpace>
        }
      >
        {relatedLogs.length === 0 ? (
          <UIEmptyState
            description="No related logs found"
            image={UIEmptyState.PRESENTED_IMAGE_SIMPLE}
          />
        ) : (
          <>
            {correlationKeys && (
              <UIAlert
                message="Correlation Keys"
                description={
                  <UISpace wrap>
                    {correlationKeys.requestId && (
                      <UITag>Request: {correlationKeys.requestId}</UITag>
                    )}
                    {correlationKeys.traceId && (
                      <UITag>Trace: {correlationKeys.traceId}</UITag>
                    )}
                    {correlationKeys.executionId && (
                      <UITag>Execution: {correlationKeys.executionId}</UITag>
                    )}
                    {correlationKeys.sessionId && (
                      <UITag>Session: {correlationKeys.sessionId}</UITag>
                    )}
                  </UISpace>
                }
                variant="info"
                style={{ marginBottom: 16 }}
                closable
              />
            )}

            <UITimeline
              mode="left"
              items={relatedLogs.map((relatedLog) => {
                const isCurrentLog = relatedLog.id === id;

                return {
                  color: isCurrentLog ? 'red' : getLevelColor(relatedLog.level),
                  dot: isCurrentLog ? (
                    <UIBadge variant="info" />
                  ) : (
                    getLevelIcon(relatedLog.level)
                  ),
                  label: (
                    <UITypographyText type="secondary" style={{ fontSize: 12 }}>
                      {formatDateTime(relatedLog.time)}
                    </UITypographyText>
                  ),
                  children: (
                    <UICard
                      size="small"
                      style={{
                        backgroundColor: isCurrentLog ? '#fff7e6' : undefined,
                        borderColor: isCurrentLog ? '#ffa940' : undefined,
                      }}
                    >
                      <UISpace direction="vertical" style={{ width: '100%' }} size="small">
                        <UISpace>
                          <UITag color={getLevelColor(relatedLog.level)}>
                            {relatedLog.level.toUpperCase()}
                          </UITag>
                          {relatedLog.plugin && (
                            <UITag color="purple">{String(relatedLog.plugin)}</UITag>
                          )}
                          {isCurrentLog && (
                            <UITag color="orange">YOU ARE HERE</UITag>
                          )}
                        </UISpace>
                        <UITypographyText>{String(relatedLog.msg || '(no message)')}</UITypographyText>
                        {relatedLog.err && (
                          <UITag color="red" icon={<UIIcon name="CloseCircleOutlined" />}>
                            {String(relatedLog.err.name || 'Error')}
                          </UITag>
                        )}
                      </UISpace>
                    </UICard>
                  ),
                };
              })}
            />
          </>
        )}
      </UICard>

      {/* All Log Fields */}
      <UICard
        title={
          <UISpace>
            <UIIcon name="FileTextOutlined" />
            <span>All Log Fields</span>
          </UISpace>
        }
      >
        <UITypographyParagraph
          copyable
          code
          style={{
            backgroundColor: '#fafafa',
            padding: 16,
            borderRadius: 4,
            fontSize: 12,
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
            maxHeight: 500,
            overflow: 'auto',
          }}
        >
          {JSON.stringify(log, null, 2)}
        </UITypographyParagraph>
      </UICard>
    </UIPage>
  );
}
