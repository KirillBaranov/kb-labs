/**
 * UIEmptyState component - Empty state placeholder
 *
 * Displays empty state with icon, title, description, and optional action.
 * NO hardcoded colors, uses Ant Design theme.
 */

import * as React from 'react';
import { Empty as AntEmpty, theme } from 'antd';
import { UIBox } from '../primitives/UIBox';
import { UIText } from '../primitives/UIText';
import { UIFlex } from '../primitives/UIFlex';
import { spacing } from '@kb-labs/studio-ui-core';

const { useToken } = theme;

export interface UIEmptyStateProps {
  /** Empty state icon */
  icon?: React.ReactNode;
  /** Empty state title */
  title?: string;
  /** Empty state description */
  description?: string;
  /** Action button */
  action?: React.ReactNode;
  /** Children rendered below description/action (alias for action) */
  children?: React.ReactNode;
  /** Use default Ant Design empty image */
  useDefaultImage?: boolean;
  /** Additional CSS class */
  className?: string;
  /** Additional styles */
  style?: React.CSSProperties;
  /** Ant Design image prop (e.g. Empty.PRESENTED_IMAGE_SIMPLE) */
  image?: React.ReactNode;
}

/**
 * UIEmptyState - Empty state placeholder
 *
 * @example
 * ```tsx
 * <UIEmptyState
 *   title="No workflows"
 *   description="Get started by creating your first workflow"
 *   action={<UIButton variant="primary">Create Workflow</UIButton>}
 * />
 *
 * <UIEmptyState
 *   icon={<SearchIcon />}
 *   title="No results found"
 *   description="Try adjusting your search criteria"
 * />
 *
 * <UIEmptyState useDefaultImage />
 * ```
 */
export function UIEmptyState({
  icon,
  title,
  description,
  action,
  children,
  useDefaultImage,
  image,
  className,
  style: customStyle,
}: UIEmptyStateProps) {
  const { token } = useToken();

  const content = children ?? action;

  if (useDefaultImage || image !== undefined) {
    return (
      <AntEmpty
        description={description}
        image={image}
        className={className}
        style={customStyle}
      >
        {content}
      </AntEmpty>
    );
  }

  const style: React.CSSProperties = {
    padding: spacing[8],
    textAlign: 'center',
    ...customStyle,
  };

  return (
    <UIBox className={className} style={style}>
      <UIFlex direction="column" align="center" gap={3}>
        {icon && (
          <UIBox style={{ fontSize: '48px', color: token.colorTextSecondary }}>
            {icon}
          </UIBox>
        )}

        {title && (
          <UIText size="lg" weight="semibold">
            {title}
          </UIText>
        )}

        {description && (
          <UIText size="base" color="secondary">
            {description}
          </UIText>
        )}

        {content && <UIBox mt={2}>{content}</UIBox>}
      </UIFlex>
    </UIBox>
  );
}

UIEmptyState.PRESENTED_IMAGE_SIMPLE = AntEmpty.PRESENTED_IMAGE_SIMPLE;
UIEmptyState.PRESENTED_IMAGE_DEFAULT = AntEmpty.PRESENTED_IMAGE_DEFAULT;
