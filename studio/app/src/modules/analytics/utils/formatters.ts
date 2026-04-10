/**
 * @module analytics/utils/formatters
 * Common formatting utilities for analytics pages
 */

/**
 * Format cost with adaptive precision based on magnitude.
 *
 * Uses different decimal places depending on the value:
 * - >= $1.00: 2 decimal places ($12.34)
 * - >= $0.01: 4 decimal places ($0.0123)
 * - >= $0.0001: 6 decimal places ($0.000123)
 * - < $0.0001: scientific notation ($1.23e-7)
 *
 * This ensures tiny costs (like $0.00028695) are visible in charts
 * while keeping larger values readable.
 *
 * @example
 * formatCost(12.3456) // "$12.35"
 * formatCost(0.0123456) // "$0.0123"
 * formatCost(0.00028695) // "$0.000287"
 * formatCost(0.00000012) // "$1.20e-7"
 */
export function formatCost(cost: number | undefined | null): string {
  if (cost == null || isNaN(cost)) {
    return '$0.00';
  }
  // Handle zero explicitly
  if (cost === 0) {
    return '$0.00';
  }

  if (cost >= 1) {
    return `$${cost.toFixed(2)}`;
  }
  if (cost >= 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  if (cost >= 0.0001) {
    return `$${cost.toFixed(6)}`;
  }
  // For very small values (< $0.0001), use scientific notation
  return `$${cost.toExponential(2)}`;
}

/**
 * Format number with thousand separators.
 *
 * @example
 * formatNumber(1234567) // "1,234,567"
 */
export function formatNumber(num: number): string {
  return num.toLocaleString();
}

/**
 * Format duration in milliseconds to human-readable string.
 *
 * @example
 * formatDuration(500) // "500ms"
 * formatDuration(2500) // "2.50s"
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms.toFixed(0)}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Format byte size to human-readable string.
 *
 * @example
 * formatSize(512) // "512 B"
 * formatSize(2048) // "2.00 KB"
 * formatSize(1048576) // "1.00 MB"
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Format percentage value.
 *
 * @example
 * formatPercentage(0.856) // "85.6%"
 * formatPercentage(0.1234) // "12.3%"
 */
export function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
