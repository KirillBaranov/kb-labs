/**
 * @module @kb-labs/studio-app/utils/format-date
 * Date formatting utilities for Studio UI
 */

export interface FormatTimestampOptions {
  /**
   * Locale to use for formatting (defaults to browser locale)
   */
  locale?: string;
  /**
   * Whether to include time (default: true)
   */
  includeTime?: boolean;
  /**
   * Whether to use 24-hour format (default: true)
   */
  hour24?: boolean;
}

/**
 * Format ISO timestamp to human-readable string using browser's locale
 *
 * @param isoString - ISO 8601 timestamp string (e.g., "2025-12-21T21:05:36.544Z")
 * @param options - Formatting options
 * @returns Formatted date string (e.g., "12/21/2025, 21:05:36" for en-US locale)
 *
 * @example
 * ```ts
 * formatTimestamp("2025-12-21T21:05:36.544Z")
 * // => "12/21/2025, 21:05:36" (en-US)
 * // => "21.12.2025, 21:05:36" (de-DE)
 * // => "2025/12/21 21:05:36" (ja-JP)
 *
 * formatTimestamp("2025-12-21T21:05:36.544Z", { includeTime: false })
 * // => "12/21/2025"
 *
 * formatTimestamp(null)
 * // => "N/A"
 * ```
 */
export function formatTimestamp(
  isoString: string | null | undefined,
  options?: FormatTimestampOptions
): string {
  if (!isoString) {
    return 'N/A';
  }

  try {
    const date = new Date(isoString);

    // Check if date is valid
    if (Number.isNaN(date.getTime())) {
      return isoString;
    }

    const { locale, includeTime = true, hour24 = true } = options ?? {};

    const formatOptions: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    };

    if (includeTime) {
      formatOptions.hour = '2-digit';
      formatOptions.minute = '2-digit';
      formatOptions.second = '2-digit';
      formatOptions.hour12 = !hour24;
    }

    return date.toLocaleString(locale, formatOptions);
  } catch {
    return isoString;
  }
}

/**
 * Format duration in milliseconds to human-readable string
 *
 * @param ms - Duration in milliseconds
 * @returns Formatted duration (e.g., "5m 30s", "1h 20m", "45s")
 *
 * @example
 * ```ts
 * formatDuration(45000)      // => "45s"
 * formatDuration(330000)     // => "5m 30s"
 * formatDuration(4800000)    // => "1h 20m"
 * formatDuration(null)       // => "N/A"
 * ```
 */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) {
    return 'N/A';
  }

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }

  if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }

  return `${seconds}s`;
}

/**
 * Format relative time (e.g., "2 hours ago", "in 5 minutes")
 *
 * @param isoString - ISO 8601 timestamp string
 * @param locale - Locale to use (defaults to browser locale)
 * @returns Relative time string
 *
 * @example
 * ```ts
 * formatRelativeTime("2025-12-21T19:05:36.544Z") // 2 hours ago
 * // => "2 hours ago" (en-US)
 * // => "vor 2 Stunden" (de-DE)
 * ```
 */
export function formatRelativeTime(
  isoString: string | null | undefined,
  locale?: string
): string {
  if (!isoString) {
    return 'N/A';
  }

  try {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) {
      return isoString;
    }

    const now = Date.now();
    const diff = date.getTime() - now;
    const absDiff = Math.abs(diff);

    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

    if (absDiff < 60_000) {
      // < 1 minute
      return rtf.format(Math.floor(diff / 1000), 'second');
    }
    if (absDiff < 3600_000) {
      // < 1 hour
      return rtf.format(Math.floor(diff / 60_000), 'minute');
    }
    if (absDiff < 86400_000) {
      // < 1 day
      return rtf.format(Math.floor(diff / 3600_000), 'hour');
    }
    // >= 1 day
    return rtf.format(Math.floor(diff / 86400_000), 'day');
  } catch {
    return isoString;
  }
}
