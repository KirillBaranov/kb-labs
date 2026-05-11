/**
 * Inline status badges for CLI output.
 *
 * @example
 * badge('ONLINE', 'success')   → green  [ONLINE]
 * badge('FAILED', 'error')     → red    [FAILED]
 * badge('PENDING', 'neutral')  → muted  [PENDING]
 */

import { safeColors } from './colors.js';

export type BadgeVariant = 'success' | 'error' | 'warning' | 'info' | 'neutral';

const BADGE_COLORS: Record<BadgeVariant, (s: string) => string> = {
  success: safeColors.success,
  error:   safeColors.error,
  warning: safeColors.warning,
  info:    safeColors.info,
  neutral: safeColors.muted,
};

export function badge(label: string, variant: BadgeVariant = 'neutral'): string {
  const colorFn = BADGE_COLORS[variant];
  return colorFn(`[${label.toUpperCase()}]`);
}

export function statusBadge(status: string): string {
  const s = status.toLowerCase();
  if (s === 'online' || s === 'running' || s === 'success' || s === 'active' || s === 'done') {
    return badge(status, 'success');
  }
  if (s === 'offline' || s === 'failed' || s === 'error' || s === 'stopped') {
    return badge(status, 'error');
  }
  if (s === 'degraded' || s === 'warning' || s === 'reconnecting' || s === 'pending') {
    return badge(status, 'warning');
  }
  if (s === 'starting' || s === 'initializing') {
    return badge(status, 'info');
  }
  return badge(status, 'neutral');
}
