/**
 * @module @kb-labs/studio-app/components/widget-error-boundary
 * Error Boundary for widget isolation — keeps one widget crash from affecting the rest of the page.
 */

import * as React from 'react';
import { UIButton, UITypographyText, UITag } from '@kb-labs/studio-ui-kit';
import { AlertTriangle, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import { trackWidgetEvent } from '../utils/analytics';

export interface WidgetErrorBoundaryProps {
  widgetId?: string;
  pluginId?: string;
  children: React.ReactNode;
  fallback?: React.ComponentType<{ error: Error; resetError: () => void }>;
}

interface State {
  hasError: boolean;
  error: Error | null;
  detailsOpen: boolean;
}

export class WidgetErrorBoundary extends React.Component<WidgetErrorBoundaryProps, State> {
  constructor(props: WidgetErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, detailsOpen: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    if (this.props.widgetId && this.props.pluginId) {
      trackWidgetEvent('error', {
        widgetId: this.props.widgetId,
        pluginId: this.props.pluginId,
        code: error.message,
      });
    }
    console.error('[WidgetErrorBoundary]', error, errorInfo);
  }

  resetError = (): void => {
    this.setState({ hasError: false, error: null, detailsOpen: false });
  };

  toggleDetails = (): void => {
    this.setState((s) => ({ detailsOpen: !s.detailsOpen }));
  };

  override render(): React.ReactNode {
    if (!this.state.hasError || !this.state.error) {
      return this.props.children;
    }

    if (this.props.fallback) {
      const Fallback = this.props.fallback;
      return <Fallback error={this.state.error} resetError={this.resetError} />;
    }

    const { error, detailsOpen } = this.state;
    const { widgetId, pluginId } = this.props;

    return (
      <div style={{
        height: '100%',
        minHeight: 120,
        border: '1px solid var(--border-primary)',
        borderRadius: 8,
        display: 'flex',
        flexDirection: 'column',
        padding: '12px 14px',
        gap: 6,
        backgroundColor: 'var(--bg-secondary)',
        overflow: 'hidden',
      }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <AlertTriangle size={14} style={{ color: 'var(--error)', flexShrink: 0 }} />
          <UITypographyText strong style={{ fontSize: 13 }}>Widget error</UITypographyText>
        </div>

        {/* Context */}
        {(pluginId || widgetId) && (
          <UITypographyText type="secondary" style={{ fontSize: 11, fontFamily: 'monospace' }}>
            {[pluginId, widgetId].filter(Boolean).join(' › ')}
          </UITypographyText>
        )}

        {/* Message — truncated */}
        <UITypographyText
          type="secondary"
          style={{
            fontSize: 12,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {error.message || 'Unknown error'}
        </UITypographyText>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
          <UIButton size="small" icon={<RotateCcw size={11} />} onClick={this.resetError}>
            Retry
          </UIButton>
          <button
            onClick={this.toggleDetails}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              color: 'var(--text-tertiary)',
              fontSize: 11,
            }}
          >
            {detailsOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            Details
          </button>
        </div>

        {/* Expandable details */}
        {detailsOpen && (
          <div style={{
            marginTop: 4,
            border: '1px solid var(--border-primary)',
            borderRadius: 4,
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '6px 8px',
              borderBottom: error.stack ? '1px solid var(--border-primary)' : undefined,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}>
              <UITag variant="error" style={{ margin: 0, fontSize: 10 }}>{error.name}</UITag>
            </div>
            {error.stack && (
              <div style={{
                padding: '6px 8px',
                maxHeight: 120,
                overflowY: 'auto',
                background: 'var(--bg-tertiary)',
              }}>
                <pre style={{
                  margin: 0,
                  fontFamily: 'monospace',
                  fontSize: 10,
                  lineHeight: 1.5,
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
    );
  }
}
