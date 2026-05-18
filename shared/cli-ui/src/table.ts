/**
 * Table formatting utilities for CLI output
 * Handles proper column alignment accounting for emoji/unicode width
 */

/**
 * Calculate visual width of a string (accounting for emoji/wide chars and ANSI codes)
 * Simplified version - emoji count as 2 chars, ANSI codes are stripped
 */
function visualWidth(str: string): number {
  const ansiRegex = /\x1B\[[0-9;]*[a-zA-Z]/g;
  const cleanStr = str.replace(ansiRegex, '');

  // Only count genuinely double-width characters: high-plane emoji (U+1F000+) and CJK blocks.
  // BMP symbols like ✓ ✗ ◆ ○ (dingbats, arrows, geometric shapes) are single-width in terminals.
  const doubleWidthRegex = /[\u{1100}-\u{115F}]|[\u{2E80}-\u{A4CF}]|[\u{AC00}-\u{D7AF}]|[\u{F900}-\u{FAFF}]|[\u{FE10}-\u{FE1F}]|[\u{FE30}-\u{FE4F}]|[\u{FF01}-\u{FF60}]|[\u{FFE0}-\u{FFE6}]|[\u{1F000}-\u{1FFFF}]/gu;
  const wideMatches = cleanStr.match(doubleWidthRegex);
  const wideCount = wideMatches ? wideMatches.length : 0;

  // Use codepoint count (not UTF-16 length) so surrogate-pair emoji count as 1 base + 1 extra = 2.
  return [...cleanStr].length + wideCount;
}

/**
 * Pad string to visual width (accounting for emoji)
 */
function padVisual(str: string, width: number, padChar: string = ' '): string {
  const vWidth = visualWidth(str);
  const padding = Math.max(0, width - vWidth);
  return str + padChar.repeat(padding);
}

export interface TableColumn {
  header: string;
  width?: number; // Auto-calculated if not provided
  align?: 'left' | 'right' | 'center';
}

export interface TableOptions {
  header?: boolean;
  separator?: string; // Character for separator line (e.g., '─')
  padding?: number; // Padding between columns
}

/**
 * Format data as a table with proper column alignment
 */
export function formatTable(
  columns: TableColumn[],
  rows: string[][],
  options: TableOptions = {}
): string[] {
  const { header = true, separator = '─', padding = 1 } = options;
  
  // Calculate column widths
  const widths: number[] = columns.map((col, idx) => {
    if (col.width !== undefined) {
      return col.width;
    }
    
    // Calculate max width from header and all rows
    let maxWidth = visualWidth(col.header);
    for (const row of rows) {
      if (row[idx]) {
        maxWidth = Math.max(maxWidth, visualWidth(String(row[idx])));
      }
    }
    return maxWidth;
  });
  
  const lines: string[] = [];
  
  // Header
  if (header) {
    const headerCells = columns.map((col, idx) => {
      const cell = col.header;
      const width = widths[idx]!;
      return padVisual(cell, width);
    });
    lines.push(headerCells.join(' '.repeat(padding)));
    
    // Separator
    if (separator) {
      const separatorLine = widths.map(w => separator.repeat(w)).join(' '.repeat(padding));
      lines.push(separatorLine);
    }
  }
  
  // Rows
  for (const row of rows) {
    const cells = columns.map((col, idx) => {
      const cell = row[idx] !== undefined ? String(row[idx]) : '';
      const align = col.align || 'left';
      const width = widths[idx]!;
      
      if (align === 'right') {
        const vWidth = visualWidth(cell);
        const padding = Math.max(0, width - vWidth);
        return ' '.repeat(padding) + cell;
      } else if (align === 'center') {
        const vWidth = visualWidth(cell);
        const padding = Math.max(0, width - vWidth);
        const leftPad = Math.floor(padding / 2);
        const rightPad = padding - leftPad;
        return ' '.repeat(leftPad) + cell + ' '.repeat(rightPad);
      } else {
        return padVisual(cell, width);
      }
    });
    lines.push(cells.join(' '.repeat(padding)));
  }
  
  return lines;
}

/**
 * Format simple key-value pairs as a table
 */
export function formatKeyValueTable(
  data: Record<string, string | number>,
  options: { keyWidth?: number; valueWidth?: number } = {}
): string[] {
  const keys = Object.keys(data);
  if (keys.length === 0) {return [];}
  
  const keyWidth = options.keyWidth || Math.max(...keys.map(k => visualWidth(k)), 0);
  const valueWidth = options.valueWidth || Math.max(...Object.values(data).map(v => visualWidth(String(v))), 0);
  
  return keys.map(key => {
    const value = String(data[key]);
    return `${padVisual(key, keyWidth)}  ${padVisual(value, valueWidth)}`;
  });
}
