/**
 * Table formatting utilities for CLI output
 * Handles proper column alignment accounting for emoji/unicode width
 */

/**
 * Calculate visual width of a string (accounting for emoji/wide chars and ANSI codes)
 * Simplified version - emoji count as 2 chars, ANSI codes are stripped
 */
function visualWidth(str: string): number {
  // Remove ANSI escape codes first
  const ansiRegex = /\x1B\[[0-9;]*[a-zA-Z]/g;
  const cleanStr = str.replace(ansiRegex, '');
  
  // Count emoji and wide characters as 2
  const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{2190}-\u{21FF}]|[\u{2300}-\u{23FF}]|[\u{24C2}-\u{1F251}]|[\u{2B50}-\u{2B55}]|[\u{3030}-\u{303D}]|[\u{3297}-\u{3299}]|[\u{1F000}-\u{1F02F}]|[\u{1F0A0}-\u{1F0FF}]|[\u{1F100}-\u{1F1FF}]|[\u{1F200}-\u{1F2FF}]|[\u{1F300}-\u{1F5FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F700}-\u{1F7FF}]|[\u{1F800}-\u{1F8FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{23F0}-\u{23FF}]|[\u{25A0}-\u{25FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{FE00}-\u{FE0F}]|[\u{1F1E6}-\u{1F1FF}]|[\u{1F3FB}-\u{1F3FF}]|[\u{1F9B0}-\u{1F9B3}]|[\u{20E3}]|[\u{FE0F}]/gu;
  const emojiMatches = cleanStr.match(emojiRegex);
  const emojiCount = emojiMatches ? emojiMatches.length : 0;
  
  // Basic character count minus emoji count (since emoji are already counted)
  // Then add emoji count * 2 for visual width
  return cleanStr.length - emojiCount + emojiCount * 2;
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
