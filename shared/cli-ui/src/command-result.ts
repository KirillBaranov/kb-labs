/**
 * Command result formatting utilities
 * Provides high and low-level APIs for formatting command output
 */

import {
  sideBorderBox,
  metricsList,
  bulletList,
  type SectionContent,
} from './modern-format';

/**
 * Command output with human and machine-readable formats
 * Extends CommandResult contract from command-kit
 */
export interface CommandOutput {
  /** Whether command executed successfully - required by CommandResult contract */
  ok: boolean;
  /** Execution status */
  status?: 'success' | 'error' | 'warning' | 'info' | 'failed' | 'cancelled' | 'skipped';
  /** Human-readable output (side border format) */
  human: string;
  /** Machine-readable output (JSON) */
  json: object;
  /** Agent-specific output (optional, for --agent flag) */
  agent?: object;
}

/**
 * Parameters for formatting command results
 */
export interface CommandResultParams {
  title: string;
  summary?: Record<string, string | number>;
  details?: Array<{ section: string; items: string[] }>;
  warnings?: string[];
  errors?: string[];
  timing?: number;
  status: 'success' | 'error' | 'warning' | 'info';
  /** Custom JSON data (optional) */
  jsonData?: object;
}

/**
 * Low-level: Format command result with full control
 *
 * @example
 * ```typescript
 * const output = formatCommandResult({
 *   title: 'System Diagnostics',
 *   summary: { 'Total Checks': 4, 'OK': 3 },
 *   details: [
 *     { section: 'Environment', items: ['Node 20.11.0'] }
 *   ],
 *   warnings: ['Cache is old'],
 *   timing: 150,
 *   status: 'success',
 * });
 *
 * console.log(output.human);  // Pretty CLI output
 * console.log(output.json);   // JSON for --json flag
 * ```
 */
export function formatCommandResult(params: CommandResultParams): CommandOutput {
  const {
    title,
    summary,
    details = [],
    warnings = [],
    errors = [],
    timing,
    status,
    jsonData,
  } = params;

  // Build sections for human output
  const sections: SectionContent[] = [];

  // Summary section
  if (summary && Object.keys(summary).length > 0) {
    sections.push({
      header: 'Summary',
      items: metricsList(summary),
    });
  }

  // Details sections
  for (const detail of details) {
    sections.push({
      header: detail.section,
      items: detail.items,
    });
  }

  // Warnings section
  if (warnings.length > 0) {
    sections.push({
      header: '⚠ Warnings',
      items: bulletList(warnings),
    });
  }

  // Errors section
  if (errors.length > 0) {
    sections.push({
      header: '✗ Errors',
      items: bulletList(errors),
    });
  }

  // Generate human-readable output
  const human = sideBorderBox({
    title,
    sections,
    status,
    timing,
  });

  // Generate JSON output
  const json: any = {
    ok: status === 'success',
    status,
    ...(summary && { summary }),
    ...(details.length > 0 && {
      details: details.reduce((acc, d) => {
        acc[d.section] = d.items;
        return acc;
      }, {} as Record<string, string[]>),
    }),
    ...(warnings.length > 0 && { warnings }),
    ...(errors.length > 0 && { errors }),
    ...(timing !== undefined && { timingMs: timing }),
    ...(jsonData && { data: jsonData }),
  };

  return {
    ok: status === 'success',
    status,
    human,
    json
  };
}

/**
 * High-level: Quick success result
 *
 * @example
 * ```typescript
 * return successResult('Version Info', {
 *   summary: { 'CLI Version': '0.1.0' },
 *   timing: 5,
 * });
 * ```
 */
export function successResult(
  title: string,
  data?: {
    summary?: Record<string, string | number>;
    details?: Array<{ section: string; items: string[] }>;
    timing?: number;
    json?: object;
  }
): CommandOutput {
  return formatCommandResult({
    title,
    summary: data?.summary,
    details: data?.details,
    timing: data?.timing,
    status: 'success',
    jsonData: data?.json,
  });
}

/**
 * High-level: Quick error result
 *
 * @example
 * ```typescript
 * return errorResult('Command Failed', new Error('Something went wrong'), {
 *   timing: 100,
 *   suggestions: ['Try running with --debug flag'],
 * });
 * ```
 */
export function errorResult(
  title: string,
  error: Error | string,
  options?: {
    timing?: number;
    suggestions?: string[];
  }
): CommandOutput {
  const errorMessage = error instanceof Error ? error.message : error;
  const errorStack = error instanceof Error ? error.stack : undefined;

  return formatCommandResult({
    title,
    errors: [errorMessage],
    details: options?.suggestions
      ? [{ section: 'Suggestions', items: bulletList(options.suggestions) }]
      : [],
    timing: options?.timing,
    status: 'error',
    jsonData: {
      error: errorMessage,
      ...(errorStack && { stack: errorStack }),
    },
  });
}

/**
 * High-level: Quick warning result
 *
 * @example
 * ```typescript
 * return warningResult('Configuration Updated', ['Deprecated option used'], {
 *   summary: { 'Files Updated': 3 },
 *   timing: 50,
 * });
 * ```
 */
export function warningResult(
  title: string,
  warnings: string[],
  options?: {
    summary?: Record<string, string | number>;
    timing?: number;
  }
): CommandOutput {
  return formatCommandResult({
    title,
    warnings,
    summary: options?.summary,
    timing: options?.timing,
    status: 'warning',
  });
}

/**
 * High-level: Info result
 *
 * @example
 * ```typescript
 * return infoResult('Help Information', {
 *   details: [
 *     { section: 'Usage', items: ['kb command --flag'] }
 *   ],
 * });
 * ```
 */
export function infoResult(
  title: string,
  data?: {
    summary?: Record<string, string | number>;
    details?: Array<{ section: string; items: string[] }>;
    timing?: number;
  }
): CommandOutput {
  return formatCommandResult({
    title,
    summary: data?.summary,
    details: data?.details,
    timing: data?.timing,
    status: 'info',
  });
}
