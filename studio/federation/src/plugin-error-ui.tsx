/**
 * Shared error UI primitives for plugin load/runtime failures.
 * Used by PageContainer (load errors) and PageErrorBoundary (runtime crashes).
 */

import { useState } from 'react';
import { Button, Typography, Tag } from 'antd';
import {
  WarningOutlined, BugOutlined, DownOutlined, UpOutlined,
  CopyOutlined, CheckOutlined, ReloadOutlined,
} from '@ant-design/icons';

const { Text, Paragraph } = Typography;

export interface PluginErrorDetails {
  /** Error type: 'load' = failed to fetch remote, 'crash' = runtime exception */
  type: 'load' | 'crash';
  pluginId: string;
  pageId: string;
  error: Error;
  /** Module Federation specific — only for load errors */
  remoteName?: string;
  entry?: string;
}

interface PluginErrorUIProps extends PluginErrorDetails {
  onRetry: () => void;
}

export function PluginErrorUI({
  type,
  pluginId,
  pageId,
  error,
  remoteName,
  entry,
  onRetry,
}: PluginErrorUIProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const isLoad = type === 'load';

  const title = isLoad ? 'Plugin unavailable' : 'Plugin crashed';
  const subtitle = isLoad
    ? 'Could not load the plugin bundle. The service may be down or the plugin is not built.'
    : 'An unexpected error occurred while rendering this plugin.';

  const handleCopy = () => {
    const lines = [
      `Plugin: ${pluginId}`,
      `Page: ${pageId}`,
      remoteName ? `Remote: ${remoteName}` : null,
      entry ? `Entry: ${entry}` : null,
      ``,
      `${error.name}: ${error.message}`,
      error.stack ? `\n${error.stack}` : null,
    ].filter(Boolean).join('\n');

    navigator.clipboard.writeText(lines).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 320,
      padding: '32px 24px',
    }}>
      <div style={{ maxWidth: 560, width: '100%' }}>
        {/* Icon + title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          {isLoad
            ? <WarningOutlined style={{ fontSize: 18, color: 'var(--warning)', flexShrink: 0 }} />
            : <BugOutlined style={{ fontSize: 18, color: 'var(--error)', flexShrink: 0 }} />
          }
          <Text strong style={{ fontSize: 16 }}>{title}</Text>
        </div>

        {/* Plugin breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, paddingLeft: 32 }}>
          <Text type="secondary" style={{ fontSize: 12, fontFamily: 'monospace' }}>
            {pluginId}
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>›</Text>
          <Text type="secondary" style={{ fontSize: 12, fontFamily: 'monospace' }}>
            {pageId}
          </Text>
        </div>

        {/* Subtitle */}
        <Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 16, paddingLeft: 32 }}>
          {subtitle}
        </Paragraph>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, paddingLeft: 32, marginBottom: 16 }}>
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={onRetry}
          >
            Retry
          </Button>
          <Button
            size="small"
            icon={copied ? <CheckOutlined /> : <CopyOutlined />}
            onClick={handleCopy}
          >
            {copied ? 'Copied' : 'Copy details'}
          </Button>
        </div>

        {/* Developer details toggle */}
        <div style={{ paddingLeft: 32 }}>
          <button
            onClick={() => setDetailsOpen((v) => !v)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              color: 'var(--text-tertiary)',
              fontSize: 12,
              marginBottom: detailsOpen ? 12 : 0,
            }}
          >
            {detailsOpen ? <UpOutlined style={{ fontSize: 11 }} /> : <DownOutlined style={{ fontSize: 11 }} />}
            Developer details
          </button>

          {detailsOpen && (
            <div style={{
              border: '1px solid var(--border-primary)',
              borderRadius: 6,
              overflow: 'hidden',
            }}>
              {/* Error type + plugin context */}
              <div style={{
                padding: '10px 12px',
                borderBottom: '1px solid var(--border-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
              }}>
                <Tag color={isLoad ? 'orange' : 'red'} style={{ margin: 0 }}>
                  {error.name}
                </Tag>
                {remoteName && (
                  <Text type="secondary" style={{ fontSize: 11, fontFamily: 'monospace' }}>
                    remote: {remoteName}
                  </Text>
                )}
                {entry && (
                  <Text type="secondary" style={{ fontSize: 11, fontFamily: 'monospace' }}>
                    entry: {entry}
                  </Text>
                )}
              </div>

              {/* Error message */}
              <div style={{
                padding: '10px 12px',
                borderBottom: error.stack ? '1px solid var(--border-primary)' : undefined,
                fontFamily: 'monospace',
                fontSize: 12,
                color: 'var(--text-primary)',
                wordBreak: 'break-word',
              }}>
                {error.message}
              </div>

              {/* Stack trace */}
              {error.stack && (
                <div style={{
                  padding: '10px 12px',
                  maxHeight: 200,
                  overflowY: 'auto',
                  background: 'var(--bg-tertiary)',
                }}>
                  <pre style={{
                    margin: 0,
                    fontFamily: 'monospace',
                    fontSize: 11,
                    lineHeight: 1.6,
                    color: 'var(--text-secondary)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}>
                    {error.stack}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
