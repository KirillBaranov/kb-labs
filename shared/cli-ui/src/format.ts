/**
 * Output formatting utilities for structured CLI output
 */

import { safeColors, safeSymbols } from './colors';

const ANSI_PATTERN = /\u001B\[[0-9;]*m/g;

export function stripAnsi(input: string): string {
  return input.replace(ANSI_PATTERN, '');
}

export function hasAnsi(input: string): boolean {
  return /\u001B\[[0-9;]*m/.test(input);
}

function visibleLength(input: string): number {
  return stripAnsi(input).length;
}

/**
 * Create a boxed section with title
 */
export function box(title: string, content: string[] = [], maxWidth?: number): string {
  const lines = content.length > 0 ? content : [''];
  const titleWidth = visibleLength(title);
  
  // Determine max width: use provided maxWidth, or terminal width (default 80), or content width
  const terminalWidth = typeof process !== 'undefined' && process.stdout?.columns ? process.stdout.columns : 80;
  const effectiveMaxWidth = maxWidth ?? Math.min(terminalWidth - 4, 120); // -4 for borders and padding
  
  const bodyWidth = Math.min(
    effectiveMaxWidth,
    Math.max(titleWidth, ...lines.map(line => visibleLength(line)))
  );

  // Wrap long lines
  const wrappedLines: string[] = [];
  for (const line of lines) {
    const lineLength = visibleLength(line);
    if (lineLength <= bodyWidth) {
      wrappedLines.push(line);
    } else {
      // Split long lines at word boundaries when possible
      const words = line.split(/(\s+)/);
      let currentLine = '';
      for (const word of words) {
        const testLine = currentLine + word;
        if (visibleLength(testLine) <= bodyWidth) {
          currentLine = testLine;
        } else {
          if (currentLine) {
            wrappedLines.push(currentLine.trimEnd());
          }
          // If single word is too long, truncate it
          if (visibleLength(word) > bodyWidth) {
            wrappedLines.push(truncate(word, bodyWidth));
            currentLine = '';
          } else {
            currentLine = word;
          }
        }
      }
      if (currentLine) {
        wrappedLines.push(currentLine.trimEnd());
      }
    }
  }

  const topBorder = `┌${'─'.repeat(bodyWidth + 2)}┐`;
  const titleLine = `│ ${safeColors.bold(title)}${' '.repeat(Math.max(0, bodyWidth - titleWidth))} │`;
  const bodyLines = wrappedLines.map((line) => {
    const padding = Math.max(0, bodyWidth - visibleLength(line));
    return `│ ${line}${' '.repeat(padding)} │`;
  });
  const bottomBorder = `└${'─'.repeat(bodyWidth + 2)}┘`;

  return [topBorder, titleLine, ...bodyLines, bottomBorder].join('\n');
}

/**
 * Add consistent indentation to lines
 */
export function indent(lines: string[], level = 1): string[] {
  const prefix = '  '.repeat(level);
  return lines.map(line => `${prefix}${line}`);
}

/**
 * Create a section with header and content
 */
export function section(header: string, content: string[]): string[] {
  return [
    '',
    safeColors.bold(header),
    ...indent(content),
  ];
}

/**
 * Format a table with consistent spacing
 */
export function table(rows: (string | number)[][], headers?: string[]): string[] {
  if (rows.length === 0) {return [];}
  
  // Calculate column widths
  const allRows = headers ? [headers, ...rows] : rows;
  if (allRows.length === 0) {return [];}
  
  const columnWidths = allRows[0]!.map((_, colIndex) => 
    Math.max(...allRows.map(row => String(row[colIndex] || '').length))
  );
  
  // Format rows
  return allRows.map(row => {
    return row.map((cell, colIndex) => 
      String(cell || '').padEnd(columnWidths[colIndex] || 0)
    ).join('  ');
  });
}

/**
 * Format key-value pairs
 */
export interface KeyValueOptions {
  padKeys?: boolean;
}

export function keyValue(
  pairs: Record<string, string | number>,
  options: KeyValueOptions = {},
): string[] {
  const { padKeys = true } = options;
  return safeKeyValue(pairs, { pad: padKeys });
}

/**
 * Format a list with bullets
 */
export function bulletList(items: string[]): string[] {
  return items.map(item => `${safeSymbols.bullet} ${item}`);
}

export interface SafeKeyValueOptions {
  indent?: number;
  pad?: boolean;
  valueColor?: (value: string, key: string) => string;
}

export function safeKeyValue(
  pairs: Record<string, string | number>,
  options: SafeKeyValueOptions = {},
): string[] {
  const { indent = 0, pad = true, valueColor } = options;
  const keys = Object.keys(pairs);
  if (keys.length === 0) {
    return [];
  }
  const indentStr = ' '.repeat(indent);
  const maxKeyLength = pad
    ? Math.max(...keys.map(key => indent + stripAnsi(key).length))
    : 0;
  return keys.map((key) => {
    const rawKey = key;
    const rawValue = String(pairs[key] ?? '');
    const keyLength = indent + stripAnsi(rawKey).length;
    const padding = pad ? Math.max(0, maxKeyLength - keyLength) : 0;
    const formattedKey = `${indentStr}${rawKey}${' '.repeat(padding)}`;
    const computedValue = valueColor ? valueColor(rawValue, key) : rawValue;
    const valueText = hasAnsi(computedValue) ? computedValue : safeColors.muted(computedValue);
    return `${safeColors.bold(formattedKey)}: ${valueText}`;
  });
}

const pad2 = (value: number): string => value.toString().padStart(2, '0');

const toDate = (value: string | Date): Date => (value instanceof Date ? new Date(value.getTime()) : new Date(value));

const isValidDate = (date: Date): boolean => Number.isFinite(date.getTime());

function getOffsetMinutes(date: Date, timeZone?: string): number {
  if (!timeZone) {
    return -date.getTimezoneOffset();
  }

  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const parts = dtf.formatToParts(date);
  const lookup = Object.fromEntries(
    parts
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, Number(part.value)]),
  ) as Record<string, number | undefined>;

  const year = lookup.year ?? date.getUTCFullYear();
  const month = (lookup.month ?? date.getUTCMonth() + 1) - 1;
  const day = lookup.day ?? date.getUTCDate();
  // Intl.DateTimeFormat with hour12:false may return 24 for midnight, normalize to 0
  const hour = (lookup.hour ?? date.getUTCHours()) % 24;
  const minute = lookup.minute ?? date.getUTCMinutes();
  const second = lookup.second ?? date.getUTCSeconds();

  const asUTC = Date.UTC(year, month, day, hour, minute, second);

  return Math.round((asUTC - date.getTime()) / 60000);
}

function formatOffset(offsetMinutes: number): string {
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absMinutes = Math.abs(offsetMinutes);
  const hours = Math.floor(absMinutes / 60);
  const minutes = absMinutes % 60;
  return `${sign}${pad2(hours)}:${pad2(minutes)}`;
}

function getDateParts(date: Date, timeZone?: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  if (!timeZone) {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
      second: date.getSeconds(),
    };
  }

  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const parts = dtf.formatToParts(date);
  const lookup = Object.fromEntries(
    parts
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, Number(part.value)]),
  ) as Record<string, number | undefined>;

  return {
    year: lookup.year ?? date.getUTCFullYear(),
    month: lookup.month ?? date.getUTCMonth() + 1,
    day: lookup.day ?? date.getUTCDate(),
    // Intl.DateTimeFormat with hour12:false may return 24 for midnight, normalize to 0
    hour: (lookup.hour ?? date.getUTCHours()) % 24,
    minute: lookup.minute ?? date.getUTCMinutes(),
    second: lookup.second ?? date.getUTCSeconds(),
  };
}

/**
 * Apply primary headline styling
 */
export function headline(text: string): string {
  return safeColors.primary(safeColors.bold(text));
}

/**
 * Accent label style (used for tags/pills)
 */
export function accentLabel(text: string): string {
  return safeColors.accent(safeColors.bold(text));
}

/**
 * Muted helper
 */
export function muted(text: string): string {
  return safeColors.muted(text);
}

/**
 * Format file size
 */
export function formatSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

/**
 * Format relative time
 */
export function formatRelativeTime(timestamp: string | Date): string {
  const now = new Date();
  const time = toDate(timestamp);

  if (!isValidDate(time)) {
    return 'Invalid date';
  }

  const diffMs = now.getTime() - time.getTime();
  
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days} day${days > 1 ? 's' : ''} ago`;
  } else if (hours > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  } else if (minutes > 0) {
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  } else {
    return `${seconds} second${seconds > 1 ? 's' : ''} ago`;
  }
}

export interface FormatTimestampOptions {
  mode?: 'local' | 'iso';
  timeZone?: string;
  includeSeconds?: boolean;
  includeMilliseconds?: boolean;
  includeOffset?: boolean;
}

/**
 * Format timestamps as absolute values (local or ISO) with optional offsets
 */
export function formatTimestamp(
  timestamp: string | Date,
  options: FormatTimestampOptions = {},
): string {
  const {
    mode = 'local',
    timeZone,
    includeSeconds = false,
    includeMilliseconds = true,
    includeOffset = true,
  } = options;

  const date = toDate(timestamp);
  if (!isValidDate(date)) {
    return 'Invalid date';
  }

  const offsetMinutes = includeOffset ? getOffsetMinutes(date, timeZone) : null;
  const offsetSuffix =
    includeOffset && offsetMinutes !== null ? ` (${formatOffset(offsetMinutes)})` : '';

  if (mode === 'iso') {
    const isoRaw = date.toISOString();
    const iso = includeMilliseconds ? isoRaw : isoRaw.replace(/\.\d{3}Z$/, 'Z');
    return `${iso}${offsetSuffix}`;
  }

  const { year, month, day, hour, minute, second } = getDateParts(date, timeZone);
  const base = [
    `${year}-${pad2(month)}-${pad2(day)}`,
    `${pad2(hour)}:${pad2(minute)}${includeSeconds ? `:${pad2(second)}` : ''}`,
  ].join(' ');

  return `${base}${offsetSuffix}`;
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {return text;}
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Pad string to specific width
 */
export function pad(text: string, width: number, align: 'left' | 'right' | 'center' = 'left'): string {
  if (text.length >= width) {return text;}
  
  const padding = width - text.length;
  
  switch (align) {
    case 'right':
      return ' '.repeat(padding) + text;
    case 'center':
      const leftPad = Math.floor(padding / 2);
      const rightPad = padding - leftPad;
      return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
    default:
      return text + ' '.repeat(padding);
  }
}

export function formatDuration(ms: number): string {
  if (ms < 0) ms = 0;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return remainingSeconds === 0 ? `${minutes}m` : `${minutes}m ${remainingSeconds}s`;
}
