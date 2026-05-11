/**
 * Modern CLI formatting utilities with side border design
 * Provides minimalist, modern UI components for CLI output
 */

import { safeColors, safeSymbols } from './colors';
import { stripAnsi, bulletList as baseBulletList } from './format';
import { formatTiming as baseFormatTiming } from './command-output';

/**
 * Side border box - Clack-style design
 *
 * @example
 * ```
 * ◆  Command Name
 * │
 * │  Section Header
 * │  Key: value
 * │
 * └  ✓ Success  84ms
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

  // Title line: ◆  Title
  const titleLine = `${safeColors.primary('◆')}  ${safeColors.bold(title)}`;
  lines.push(titleLine);
  lines.push(safeColors.muted('│'));

  // Sections
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    if (!section) {continue;}

    // Section header (optional)
    if (section.header) {
      lines.push(`${safeColors.muted('│')}  ${safeColors.bold(section.header)}`);
    }

    // Section items — word-wrapped and multiline-safe
    for (const rawItem of section.items) {
      const item = typeof rawItem === 'string' ? { text: rawItem } : rawItem;
      let displayLines: string[];

      if (item.truncate !== undefined) {
        const vis = stripAnsi(item.text);
        const truncated = vis.length > item.truncate
          ? ansiSlice(item.text, item.truncate - 1) + '…'
          : item.text;
        displayLines = [item.dim ? safeColors.muted(stripAnsi(truncated)) : truncated];
      } else {
        const wrapped = wrapText(item.text, itemMaxWidth);
        displayLines = item.dim ? wrapped.map(l => safeColors.muted(l)) : wrapped;
      }

      for (const dl of displayLines) {
        lines.push(`${safeColors.muted('│')}  ${dl}`);
      }
    }

    // Add spacing between sections (but not after the last one)
    if (i < sections.length - 1) {
      lines.push(safeColors.muted('│'));
    }
  }

  // Bottom line: └  ✓ Success  84ms
  if (footer || status || timing !== undefined) {
    lines.push(safeColors.muted('│'));
    const footerParts: string[] = [];

    if (footer) {
      footerParts.push(footer);
    } else if (status) {
      const statusSymbol = getStatusSymbol(status);
      const statusColor = getStatusColor(status);
      footerParts.push(statusColor(`${statusSymbol}`));
    }

    if (timing !== undefined) {
      footerParts.push(safeColors.muted(formatTiming(timing)));
    }

    const footerLine = `${safeColors.muted('└')}  ${footerParts.join('  ')}`;
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
  const color = getStatusColor(status);

  const parts = [color(symbol)];

  if (timing !== undefined) {
    parts.push(safeColors.muted(formatTiming(timing)));
  }

  return parts.join('  ');
}

// Helper functions

/**
 * Slice a string to maxVisible visible characters, preserving ANSI escape codes.
 */
function ansiSlice(str: string, maxVisible: number): string {
  let visible = 0;
  let i = 0;
  let result = '';
  while (i < str.length) {
    if (str[i] === '\x1b' && str[i + 1] === '[') {
      let j = i + 2;
      while (j < str.length && !/[A-Za-z]/.test(str[j]!)) { j++; }
      result += str.slice(i, j + 1);
      i = j + 1;
    } else {
      if (visible >= maxVisible) { break; }
      result += str[i];
      visible++;
      i++;
    }
  }
  return result;
}

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
 * A single block in a chained output — a title + sections with optional footer on the last block.
 */
export interface SideBorderChainItem {
  title: string;
  sections: SectionContent[];
  status?: 'success' | 'error' | 'warning' | 'info';
  timing?: number;
}

/**
 * Render multiple side-border blocks as a continuous visual chain.
 *
 * Every block opens with `◆  Title` on the shared rail.
 * Only the last block gets `└  status  timing`.
 *
 * @example
 * ```
 * ◆  workflow metrics
 * │
 * │  Failed to fetch metrics
 * │
 * ◆  Warning
 * │
 * │  Make sure daemon is running
 * │
 * └  ✗  12ms
 * ```
 */
// eslint-disable-next-line sonarjs/cognitive-complexity
export function sideBorderChain(items: SideBorderChainItem[]): string {
  if (items.length === 0) { return ''; }
  if (items.length === 1) {
    const item = items[0]!;
    return sideBorderBox({ title: item.title, sections: item.sections, status: item.status, timing: item.timing });
  }

  const lines: string[] = [];
  const terminalWidth =
    typeof process !== 'undefined' && process.stdout?.columns
      ? process.stdout.columns
      : 80;
  const itemMaxWidth = Math.max(40, terminalWidth - 4);

  for (let blockIdx = 0; blockIdx < items.length; blockIdx++) {
    const block = items[blockIdx]!;
    const isLast = blockIdx === items.length - 1;

    // Block header: ◆  Title
    lines.push(`${safeColors.primary('◆')}  ${safeColors.bold(block.title)}`);
    lines.push(safeColors.muted('│'));

    // Sections
    for (let i = 0; i < block.sections.length; i++) {
      const section = block.sections[i];
      if (!section) { continue; }

      if (section.header) {
        lines.push(`${safeColors.muted('│')}  ${safeColors.bold(section.header)}`);
      }

      for (const rawItem of section.items) {
        const item = typeof rawItem === 'string' ? { text: rawItem } : rawItem;
        let displayLines: string[];

        if (item.truncate !== undefined) {
          const vis = stripAnsi(item.text);
          const truncated = vis.length > item.truncate
            ? ansiSlice(item.text, item.truncate - 1) + '…'
            : item.text;
          displayLines = [item.dim ? safeColors.muted(stripAnsi(truncated)) : truncated];
        } else {
          const wrapped = wrapText(item.text, itemMaxWidth);
          displayLines = item.dim ? wrapped.map(l => safeColors.muted(l)) : wrapped;
        }

        for (const dl of displayLines) {
          lines.push(`${safeColors.muted('│')}  ${dl}`);
        }
      }

      if (i < block.sections.length - 1) {
        lines.push(safeColors.muted('│'));
      }
    }

    if (isLast) {
      if (block.status || block.timing !== undefined) {
        lines.push(safeColors.muted('│'));
        const footerParts: string[] = [];
        if (block.status) {
          footerParts.push(getStatusColor(block.status)(getStatusSymbol(block.status)));
        }
        if (block.timing !== undefined) {
          footerParts.push(safeColors.muted(formatTiming(block.timing)));
        }
        lines.push(`${safeColors.muted('└')}  ${footerParts.join('  ')}`);
      }
    } else {
      // Blank rail line before next ◆
      lines.push(safeColors.muted('│'));
    }
  }

  return lines.join('\n');
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
