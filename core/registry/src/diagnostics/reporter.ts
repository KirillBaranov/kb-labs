/**
 * @module @kb-labs/core-registry/diagnostics/reporter
 * Build a DiagnosticReport from raw diagnostic events.
 */

import type { DiagnosticEvent } from '@kb-labs/core-discovery';
import type { DiagnosticReport } from '../types.js';

export function buildDiagnosticReport(
  events: DiagnosticEvent[],
  totalPlugins: number,
  loadedPlugins: number,
): DiagnosticReport {
  const byPlugin: Record<string, DiagnosticEvent[]> = {};
  let errors = 0;
  let warnings = 0;

  for (const event of events) {
    if (event.severity === 'error') {errors++;}
    if (event.severity === 'warning') {warnings++;}

    const key = event.context?.pluginId ?? '__global__';
    if (!byPlugin[key]) {byPlugin[key] = [];}
    byPlugin[key]!.push(event);
  }

  return {
    events,
    summary: {
      errors,
      warnings,
      totalPlugins,
      loadedPlugins,
      failedPlugins: totalPlugins - loadedPlugins,
    },
    byPlugin,
  };
}

function formatEventLines(events: DiagnosticEvent[], lines: string[]): void {
  for (const evt of events) {
    const prefix = evt.severity === 'error' ? 'ERR' : evt.severity === 'warning' ? 'WRN' : evt.severity.toUpperCase().slice(0, 3);
    lines.push(`  ${prefix} ${evt.code}: ${evt.message}`);
    if (evt.remediation) {lines.push(`      Fix: ${evt.remediation}`);}
  }
}

/**
 * Format a diagnostic report as a human-readable string.
 */
export function formatDiagnosticReport(report: DiagnosticReport): string {
  const lines: string[] = [];
  const { summary } = report;

  lines.push(`Registry Diagnostics: ${summary.loadedPlugins}/${summary.totalPlugins} plugins loaded`);
  if (summary.errors > 0) {lines.push(`  ${summary.errors} error(s)`);}
  if (summary.warnings > 0) {lines.push(`  ${summary.warnings} warning(s)`);}
  lines.push('');

  for (const [pluginId, events] of Object.entries(report.byPlugin)) {
    const label = pluginId === '__global__' ? 'Global' : pluginId;
    lines.push(`[${label}]`);
    formatEventLines(events, lines);
    lines.push('');
  }

  return lines.join('\n');
}
