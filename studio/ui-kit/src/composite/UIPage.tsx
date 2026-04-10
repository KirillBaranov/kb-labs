/**
 * UIPage component - Page container with padding and max-width
 *
 * Wraps page content with consistent padding and responsive max-width.
 * NO hardcoded colors, uses Ant Design theme.
 */

import * as React from 'react';
import { theme } from 'antd';
import { UIBox } from '../primitives/UIBox';

const { useToken } = theme;

export type UIPageWidth = 'default' | 'wide' | 'full';

export interface UIPageProps {
  /** Page content */
  children: React.ReactNode;
  /** Max width mode */
  width?: UIPageWidth;
  /**
   * Page variant:
   * - 'default' — transparent background, cards float on grey (dashboard, lists)
   * - 'document' — white card wrapping all content (settings, detail pages)
   */
  variant?: 'default' | 'document';
  /** Additional CSS class */
  className?: string;
  /** Additional styles */
  style?: React.CSSProperties;
}

/**
 * UIPage - Page container
 *
 * @example
 * ```tsx
 * <UIPage>
 *   <UIHeader title="Dashboard" />
 *   <div>Content here</div>
 * </UIPage>
 *
 * <UIPage width="wide">
 *   <div>Wider content area</div>
 * </UIPage>
 *
 * <UIPage width="full">
 *   <div>Full width, no max-width constraint</div>
 * </UIPage>
 * ```
 */
export function UIPage({
  children,
  width = 'default',
  variant = 'default',
  className,
  style: customStyle,
}: UIPageProps) {
  const { token } = useToken();

  const maxWidthMap: Record<UIPageWidth, string> = {
    default: '1280px',
    wide: '1600px',
    full: '100%',
  };

  const isDocument = variant === 'document';

  const style: React.CSSProperties = {
    maxWidth: maxWidthMap[width],
    margin: '0 auto',
    padding: token.padding,
    ...(isDocument && {
      backgroundColor: token.colorBgContainer,
      borderRadius: token.borderRadiusLG,
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    }),
    minHeight: isDocument ? undefined : '100%',
    ...customStyle,
  };

  return (
    <UIBox as="main" className={className} style={style}>
      {children}
    </UIBox>
  );
}
