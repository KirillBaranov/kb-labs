/**
 * UIErrorState component - Error state display
 *
 * Displays error state with icon, title, description, and retry action.
 * NO hardcoded colors, uses Ant Design theme.
 */

import * as React from 'react';
import { theme } from 'antd';
import { UIBox } from '../primitives/UIBox';
import { UIText } from '../primitives/UIText';
import { UIFlex } from '../primitives/UIFlex';
import { UIButton } from '../core/UIButton';
import { spacing } from '@kb-labs/studio-ui-core';

const { useToken } = theme;

export interface UIErrorStateProps {
  /** Error icon */
  icon?: React.ReactNode;
  /** Error title */
  title?: string;
  /** Error description */
  description?: string;
  /** Error details (technical message) */
  details?: string;
  /** Show retry button */
  showRetry?: boolean;
  /** Retry button text */
  retryText?: string;
  /** Retry handler */
  onRetry?: () => void;
  /** Custom action (instead of retry) */
  action?: React.ReactNode;
  /** Additional CSS class */
  className?: string;
  /** Additional styles */
  style?: React.CSSProperties;
}

/**
 * UIErrorState - Error state display
 *
 * @example
 * ```tsx
 * <UIErrorState
 *   title="Failed to load data"
 *   description="Something went wrong"
 *   showRetry
 *   onRetry={() => refetch()}
 * />
 *
 * <UIErrorState
 *   icon={<ErrorIcon />}
 *   title="Connection error"
 *   description="Unable to connect to server"
 *   details="Error: ECONNREFUSED 127.0.0.1:5000"
 *   retryText="Reconnect"
 *   onRetry={handleReconnect}
 * />
 *
 * <UIErrorState
 *   title="Access denied"
 *   description="You don't have permission to view this resource"
 *   action={<UIButton>Go Back</UIButton>}
 * />
 * ```
 */
export function UIErrorState({
  icon,
  title = 'Something went wrong',
  description,
  details,
  showRetry = false,
  retryText = 'Try again',
  onRetry,
  action,
  className,
  style: customStyle,
}: UIErrorStateProps) {
  const { token } = useToken();

  const style: React.CSSProperties = {
    padding: spacing[8],
    textAlign: 'center',
    ...customStyle,
  };

  return (
    <UIBox className={className} style={style}>
      <UIFlex direction="column" align="center" gap={3}>
        {icon && (
          <UIBox style={{ fontSize: '48px', color: token.colorError }}>
            {icon}
          </UIBox>
        )}

        <UIText size="lg" weight="semibold" color="error">
          {title}
        </UIText>

        {description && (
          <UIText size="base" color="secondary">
            {description}
          </UIText>
        )}

        {details && (
          <UIBox
            p={3}
            style={{
              backgroundColor: token.colorErrorBg,
              borderRadius: token.borderRadius,
              maxWidth: '600px',
              width: '100%',
            }}
          >
            <UIText size="sm" as="pre" style={{ margin: 0, textAlign: 'left', whiteSpace: 'pre-wrap' }}>
              {details}
            </UIText>
          </UIBox>
        )}

        {(showRetry || action) && (
          <UIBox mt={2}>
            {action || (
              <UIButton variant="primary" onClick={onRetry}>
                {retryText}
              </UIButton>
            )}
          </UIBox>
        )}
      </UIFlex>
    </UIBox>
  );
}
