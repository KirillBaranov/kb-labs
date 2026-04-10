/**
 * Command output formatting utilities
 * Provides consistent formatting for CLI command results
 */

import { box, keyValue } from './format';
import { safeColors } from './colors';

export interface CommandResult {
  title: string;
  summary: Record<string, string | number>;
  timing?: number | Record<string, number>;
  diagnostics?: string[];
  warnings?: string[];
  errors?: string[];
  suggestions?: string[];
}

/**
 * Format timing in milliseconds to human-readable string
 */
export function formatTiming(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  } else {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(1);
    return `${minutes}m ${seconds}s`;
  }
}

/**
 * Format timing breakdown as array of strings
 */
export function formatTimingBreakdown(timings: Record<string, number>): string[] {
  const lines: string[] = [];
  
  // Sort timings by value (descending) for better readability
  const sortedEntries = Object.entries(timings)
    .filter(([key]) => key !== 'total')
    .sort(([, a], [, b]) => b - a);
  
  for (const [name, ms] of sortedEntries) {
    const formattedName = name.charAt(0).toUpperCase() + name.slice(1);
    lines.push(`${formattedName}: ${formatTiming(ms)}`);
  }
  
  // Always show total at the end
  if (timings.total !== undefined) {
    lines.push(`Total: ${formatTiming(timings.total)}`);
  }
  
  return lines;
}

/**
 * Format complete command output with box, summary, timing, and additional info
 */
export function formatCommandOutput(result: CommandResult): string {
  const sections: string[] = [];
  
  // Add summary section
  const summaryLines = keyValue(result.summary);
  sections.push(...summaryLines);
  
  // Add timing section
  if (result.timing !== undefined) {
    sections.push('');
    
    if (typeof result.timing === 'number') {
      sections.push(`Time: ${formatTiming(result.timing)}`);
    } else {
      const timingLines = formatTimingBreakdown(result.timing);
      sections.push(...timingLines);
    }
  }
  
  // Add warnings section
  if (result.warnings && result.warnings.length > 0) {
    sections.push('');
    sections.push(safeColors.warning('Warnings:'));
    result.warnings.forEach(warning => 
      sections.push(`  ${safeColors.dim('•')} ${warning}`)
    );
  }
  
  // Add errors section
  if (result.errors && result.errors.length > 0) {
    sections.push('');
    sections.push(safeColors.error('Errors:'));
    result.errors.forEach(error => 
      sections.push(`  ${safeColors.dim('•')} ${error}`)
    );
  }
  
  // Add diagnostics section
  if (result.diagnostics && result.diagnostics.length > 0) {
    sections.push('');
    sections.push(safeColors.info('Diagnostics:'));
    result.diagnostics.forEach(diagnostic => 
      sections.push(`  ${safeColors.dim('•')} ${diagnostic}`)
    );
  }
  
  // Add suggestions section
  if (result.suggestions && result.suggestions.length > 0) {
    sections.push('');
    sections.push(safeColors.info('Suggestions:'));
    result.suggestions.forEach(suggestion => 
      sections.push(`  ${safeColors.dim('•')} ${suggestion}`)
    );
  }
  
  return box(result.title, sections);
}

/**
 * Create a simple command result with just title, summary, and timing
 */
export function createSimpleResult(
  title: string, 
  summary: Record<string, string | number>, 
  timing?: number
): CommandResult {
  return {
    title,
    summary,
    timing,
  };
}

/**
 * Create a detailed command result with all optional fields
 */
export function createDetailedResult(
  title: string,
  summary: Record<string, string | number>,
  options: {
    timing?: number | Record<string, number>;
    diagnostics?: string[];
    warnings?: string[];
    errors?: string[];
    suggestions?: string[];
  } = {}
): CommandResult {
  return {
    title,
    summary,
    ...options,
  };
}
