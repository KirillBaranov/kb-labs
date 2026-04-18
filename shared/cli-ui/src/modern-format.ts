/**
 * Modern CLI formatting utilities with side border design
 * Provides minimalist, modern UI components for CLI output
 */

import { safeColors, safeSymbols } from './colors';
import { stripAnsi, bulletList as baseBulletList } from './format';
import { formatTiming as baseFormatTiming } from './command-output';

/**
 * Side border box - modern minimalist design
 *
 * @example
 * ```
 * ┌── Command Name
 * │
 * │ Section Header
 * │  Key: value
 * │
 * └── ✓ Success / 12ms
 * ```
 */
export interface SideBorderBoxOptions {
  title: string;
  sections: SectionContent[];
  footer?: string;
  status?: 'success' | 'error' | 'warning' | 'info';
  timing?: number;
}

export interface RichSectionItem {
  text: string;
  /** Render text in muted/dim color */
  dim?: boolean;
  /** Hard-truncate to N visible chars instead of wrapping */
  truncate?: number;
}

/** A section item — either a plain string or a rich descriptor */
export type SectionItem = string | RichSectionItem;

export interface SectionContent {
  header?: string;
  items: SectionItem[];
}

/**
 * Create a side-bordered box with modern design
 */
export function sideBorderBox(options: SideBorderBoxOptions): string {
  const { title, sections, footer, status, timing } = options;
  const lines: string[] = [];

  const terminalWidth =
    typeof process !== 'undefined' && process.stdout?.columns
      ? process.stdout.columns
      : 80;
  // Available width for item content: terminalWidth minus "│  " prefix (3) and 1 right margin
  const itemMaxWidth = Math.max(40, terminalWidth - 4);

  // Top border with title (using top-left corner)
  const titleLine = `${safeSymbols.topLeft}${safeSymbols.separator.repeat(2)} ${safeColors.primary(safeColors.bold(title))}`;
  lines.push(titleLine);
  lines.push(safeSymbols.border);

  // Sections
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    if (!section) {continue;}

    // Section header (optional)
    if (section.header) {
      lines.push(`${safeSymbols.border} ${safeColors.bold(section.header)}`);
    }

    // Section items — word-wrapped and multiline-safe
    for (const rawItem of section.items) {
      const item = typeof rawItem === 'string' ? { text: rawItem } : rawItem;
      let displayLines: string[];

      if (item.truncate !== undefined) {
        const vis = stripAnsi(item.text);
        const truncated =
          vis.length > item.truncate ? vis.slice(0, item.truncate - 1) + '…' : vis;
        displayLines = [item.dim ? safeColors.muted(truncated) : truncated];
      } else {
        const wrapped = wrapText(item.text, itemMaxWidth);
        displayLines = item.dim ? wrapped.map(l => safeColors.muted(l)) : wrapped;
      }

      for (const dl of displayLines) {
        lines.push(`${safeSymbols.border}  ${dl}`);
      }
    }

    // Add spacing between sections (but not after the last one)
    if (i < sections.length - 1) {
      lines.push(safeSymbols.border);
    }
  }

  // Bottom border with status/timing
  if (footer || status || timing !== undefined) {
    lines.push(safeSymbols.border);
    const footerParts: string[] = [];

    if (footer) {
      footerParts.push(footer);
    } else if (status) {
      const statusSymbol = getStatusSymbol(status);
      const statusText = getStatusText(status);
      const statusColor = getStatusColor(status);
      footerParts.push(statusColor(`${statusSymbol} ${statusText}`));
    }

    if (timing !== undefined) {
      footerParts.push(formatTiming(timing));
    }

    const footerLine = `${safeSymbols.bottomLeft}${safeSymbols.separator.repeat(2)} ${footerParts.join(' / ')}`;
    lines.push(footerLine);
  }

  return lines.join('\n');
}

/**
 * Format a section header
 */
export function sectionHeader(text: string): string {
  return safeColors.bold(text);
}

/**
 * Format metrics list (key: value pairs with aligned values)
 */
export function metricsList(metrics: Record<string, string | number>): string[] {
  const entries = Object.entries(metrics);
  if (entries.length === 0) {return [];}

  // Find max key length for alignment
  const maxKeyLength = Math.max(
    ...entries.map(([key]) => stripAnsi(key).length)
  );

  return entries.map(([key, value]) => {
    const keyLength = stripAnsi(key).length;
    const padding = ' '.repeat(maxKeyLength - keyLength + 2);
    const formattedKey = safeColors.bold(key);
    const formattedValue = safeColors.muted(String(value));
    return `${formattedKey}:${padding}${formattedValue}`;
  });
}

/**
 * Format a bullet list (re-exported from base utilities)
 */
export const bulletList = baseBulletList;

/**
 * Format timing (re-exported from command-output)
 */
export const formatTiming = baseFormatTiming;

/**
 * Format status line for footer
 */
export function statusLine(
  status: 'success' | 'error' | 'warning' | 'info',
  timing?: number
): string {
  const symbol = getStatusSymbol(status);
  const text = getStatusText(status);
  const color = getStatusColor(status);

  const parts = [color(`${symbol} ${text}`)];

  if (timing !== undefined) {
    parts.push(formatTiming(timing));
  }

  return parts.join(' / ');
}

// Helper functions

function getStatusSymbol(status: 'success' | 'error' | 'warning' | 'info'): string {
  switch (status) {
    case 'success':
      return safeSymbols.success;
    case 'error':
      return safeSymbols.error;
    case 'warning':
      return safeSymbols.warning;
    case 'info':
      return safeSymbols.info;
  }
}

function getStatusText(status: 'success' | 'error' | 'warning' | 'info'): string {
  switch (status) {
    case 'success':
      return 'Success';
    case 'error':
      return 'Failed';
    case 'warning':
      return 'Warning';
    case 'info':
      return 'Info';
  }
}

function getStatusColor(status: 'success' | 'error' | 'warning' | 'info'): (text: string) => string {
  switch (status) {
    case 'success':
      return safeColors.success;
    case 'error':
      return safeColors.error;
    case 'warning':
      return safeColors.warning;
    case 'info':
      return safeColors.info;
  }
}

/**
 * Word-wrap plain text to maxWidth visible characters.
 * Handles existing newlines and long words (hard-truncated with ellipsis).
 */
function wrapText(text: string, maxWidth: number): string[] {
  const result: string[] = [];
  const rawLines = text.split('\n');
  for (const rawLine of rawLines) {
    const line = rawLine.trimEnd();
    if (stripAnsi(line).length <= maxWidth) {
      result.push(line);
      continue;
    }
    const words = line.split(/(\s+)/);
    let current = '';
    for (const word of words) {
      const test = current + word;
      if (stripAnsi(test).length <= maxWidth) {
        current = test;
      } else {
        if (current.trimEnd()) {result.push(current.trimEnd());}
        const wordLen = stripAnsi(word).length;
        if (wordLen > maxWidth) {
          // Hard-truncate a single oversized word
          result.push(stripAnsi(word).slice(0, maxWidth - 1) + '…');
          current = '';
        } else {
          current = word;
        }
      }
    }
    if (current.trimEnd()) {result.push(current.trimEnd());}
  }
  return result.length > 0 ? result : [''];
}

/**
 * Convert an Error or raw string into clean display lines for sideBorderBox items.
 * Splits on newlines, removes blank lines, and caps at maxLines with a "… N more" hint.
 *
 * @example
 * items: formatError(err, { maxLines: 6 })
 */
export function formatError(err: Error | string, opts?: { maxLines?: number }): string[] {
  const raw = err instanceof Error ? err.message : String(err);
  const allLines = raw.split('\n').map(l => l.trimEnd()).filter(l => l.length > 0);
  const max = opts?.maxLines ?? 8;
  if (allLines.length <= max) {return allLines;}
  const shown = allLines.slice(0, max - 1);
  shown.push(safeColors.muted(`… ${allLines.length - max + 1} more lines`));
  return shown;
}

/**
 * Format command help in modern side-border style
 *
 * @example
 * ```typescript
 * const help = formatCommandHelp({
 *   title: 'kb version',
 *   description: 'Show CLI version',
 *   longDescription: 'Displays the current version...',
 *   examples: ['kb version', 'kb version --json'],
 *   flags: [{name: 'json', description: 'Output in JSON'}]
 * });
 * ```
 */
export function formatCommandHelp(options: {
  title: string;
  description?: string;
  longDescription?: string;
  examples?: string[];
  flags?: Array<{ name: string; alias?: string; description?: string; required?: boolean }>;
  aliases?: string[];
}): string {
  const { title, description, longDescription, examples, flags, aliases } = options;
  const sections: SectionContent[] = [];

  // Description section
  if (description) {
    sections.push({
      header: 'Description',
      items: [description],
    });
  }

  // Long description
  if (longDescription) {
    sections.push({
      header: 'Details',
      items: [longDescription],
    });
  }

  // Aliases
  if (aliases && aliases.length > 0) {
    sections.push({
      header: 'Aliases',
      items: aliases.map(a => safeColors.muted(a)),
    });
  }

  // Flags
  if (flags && flags.length > 0) {
    const flagItems = flags.map(flag => {
      const label = flag.alias
        ? `--${flag.name}, -${flag.alias}`
        : `--${flag.name}`;
      const required = flag.required ? safeColors.warning(' (required)') : '';
      const desc = flag.description ? safeColors.muted(` — ${flag.description}`) : '';
      return `${safeColors.bold(label)}${required}${desc}`;
    });
    sections.push({
      header: 'Flags',
      items: flagItems,
    });
  }

  // Examples
  if (examples && examples.length > 0) {
    sections.push({
      header: 'Examples',
      items: examples.map(ex => safeColors.muted(`  ${ex}`)),
    });
  }

  return sideBorderBox({
    title,
    sections,
    status: 'info',
  });
}
