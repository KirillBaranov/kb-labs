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

export interface SectionContent {
  header?: string;
  items: string[];
}

/**
 * Create a side-bordered box with modern design
 */
export function sideBorderBox(options: SideBorderBoxOptions): string {
  const { title, sections, footer, status, timing } = options;
  const lines: string[] = [];

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

    // Section items
    for (const item of section.items) {
      lines.push(`${safeSymbols.border}  ${item}`);
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
