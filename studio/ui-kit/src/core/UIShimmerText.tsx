/**
 * UIShimmerText - Animated gradient shimmer on text
 *
 * Text stays visible but a highlight sweeps across it — the
 * classic "Cursor / ClickUp / Codex" loading text effect.
 * Pure CSS, zero dependencies, respects dark/light themes.
 */

import * as React from 'react';
import styles from './UIShimmerText.module.css';

export interface UIShimmerTextProps {
  /** Text to display with shimmer effect */
  children: React.ReactNode;
  /**
   * Base text color (the "dim" parts of the gradient).
   * Defaults to current text color via CSS variable.
   * @default 'var(--text-secondary, #6B7280)'
   */
  color?: string;
  /**
   * Highlight color that sweeps across.
   * @default 'var(--text-primary, #111827)'
   */
  highlight?: string;
  /**
   * Animation duration.
   * @default '2s'
   */
  duration?: string;
  /** Additional CSS class */
  className?: string;
  /** Additional styles */
  style?: React.CSSProperties;
}

/**
 * UIShimmerText - Text with animated shimmer sweep
 *
 * @example
 * // Basic
 * <UIShimmerText>Initializing plugins and widgets</UIShimmerText>
 *
 * // Custom colors
 * <UIShimmerText highlight="#6366f1" color="#c7d2fe">
 *   Loading workspace...
 * </UIShimmerText>
 *
 * // Faster sweep
 * <UIShimmerText duration="1.2s">Processing...</UIShimmerText>
 */
export function UIShimmerText({
  children,
  color = 'var(--text-secondary, #9CA3AF)',
  highlight = 'var(--text-primary, #111827)',
  duration = '2s',
  className,
  style,
}: UIShimmerTextProps) {
  return (
    <span
      className={[styles.shimmer, className].filter(Boolean).join(' ')}
      style={{
        '--shimmer-color-1': color,
        '--shimmer-color-2': color,
        '--shimmer-highlight': highlight,
        '--shimmer-duration': duration,
        ...style,
      } as React.CSSProperties}
    >
      {children}
    </span>
  );
}
