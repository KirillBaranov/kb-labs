/**
 * UISkeleton component - Loading skeleton
 *
 * Wraps Ant Design Skeleton with simplified API.
 * NO hardcoded colors, uses Ant Design theme.
 */

import * as React from 'react';
import { Skeleton as AntSkeleton } from 'antd';

export interface UISkeletonProps {
  /** Show loading state */
  loading?: boolean;
  /** Content to show when not loading */
  children?: React.ReactNode;
  /** Show avatar */
  avatar?: boolean;
  /** Avatar shape */
  avatarShape?: 'circle' | 'square';
  /** Number of paragraph lines */
  lines?: number;
  /** Show title */
  title?: boolean;
  /** Active animation */
  active?: boolean;
  /** Additional CSS class */
  className?: string;
  /** Additional styles */
  style?: React.CSSProperties;
}

/**
 * UISkeleton - Loading skeleton
 *
 * @example
 * ```tsx
 * <UISkeleton loading={isLoading}>
 *   <div>Content</div>
 * </UISkeleton>
 *
 * <UISkeleton avatar lines={3} active />
 *
 * <UISkeleton
 *   loading={isLoading}
 *   avatar
 *   avatarShape="circle"
 *   title
 *   lines={2}
 * >
 *   <ProfileCard />
 * </UISkeleton>
 * ```
 */
export function UISkeleton({
  loading = true,
  children,
  avatar,
  avatarShape = 'circle',
  lines = 3,
  title = true,
  active = true,
  className,
  style,
}: UISkeletonProps) {
  return (
    <AntSkeleton
      loading={loading}
      avatar={avatar ? { shape: avatarShape } : false}
      paragraph={{ rows: lines }}
      title={title}
      active={active}
      className={className}
      style={style}
    >
      {children}
    </AntSkeleton>
  );
}

/**
 * UISkeletonButton - Button skeleton
 */
export function UISkeletonButton(props: React.ComponentProps<typeof AntSkeleton.Button>) {
  return <AntSkeleton.Button {...props} />;
}

/**
 * UISkeletonInput - Input skeleton
 */
export function UISkeletonInput(props: React.ComponentProps<typeof AntSkeleton.Input>) {
  return <AntSkeleton.Input {...props} />;
}

/**
 * UISkeletonImage - Image skeleton
 */
export function UISkeletonImage(props: React.ComponentProps<typeof AntSkeleton.Image>) {
  return <AntSkeleton.Image {...props} />;
}

/**
 * UISkeletonNode - Custom node skeleton
 */
export function UISkeletonNode(props: React.ComponentProps<typeof AntSkeleton.Node>) {
  return <AntSkeleton.Node {...props} />;
}

export interface UISkeletonTextProps {
  /**
   * Width of the text line(s). Can be a number (px), string ('100%', '8ch'), or
   * an array to render multiple lines with different widths.
   * @default '100%'
   */
  width?: number | string | Array<number | string>;
  /**
   * Height / font-size of the shimmer block — matches the surrounding text size.
   * @default '1em'
   */
  height?: number | string;
  /** Gap between lines when width is an array */
  gap?: number | string;
  /** Additional CSS class */
  className?: string;
  /** Additional styles applied to the wrapper */
  style?: React.CSSProperties;
}

/**
 * UISkeletonText - Inline text shimmer placeholder
 *
 * Renders a shimmer block that matches the height of surrounding text.
 * Uses Ant Design's native skeleton animation so it respects the theme.
 *
 * @example
 * // Single line, full width
 * <UISkeletonText />
 *
 * // Single line, fixed width
 * <UISkeletonText width={120} height="1em" />
 *
 * // Multiple lines with varying widths (like a paragraph)
 * <UISkeletonText width={['100%', '85%', '60%']} height="14px" gap={8} />
 *
 * // Match a specific font size
 * <UISkeletonText width="8ch" height="20px" />
 */
export function UISkeletonText({
  width = '100%',
  height = '1em',
  gap = 6,
  className,
  style,
}: UISkeletonTextProps) {
  const widths = Array.isArray(width) ? width : [width];

  return (
    <span
      className={className}
      style={{ display: 'inline-flex', flexDirection: 'column', gap, ...style }}
    >
      {widths.map((w, i) => (
        <span
          key={i}
          style={{
            display: 'inline-block',
            width: w,
            height,
            overflow: 'hidden',
            borderRadius: 4,
            flexShrink: 0,
          }}
        >
          <AntSkeleton.Input
            active
            size="small"
            style={{
              width: '100%',
              minWidth: 'unset',
              height: '100%',
              display: 'block',
            }}
          />
        </span>
      ))}
    </span>
  );
}
