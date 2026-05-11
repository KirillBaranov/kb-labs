/**
 * Structured log display for CLI output (watch/run/stream commands).
 * Not a spinner — for rendering log lines with level, timestamp, and message.
 */

import { safeColors } from './colors.js';

export type LogLevel = 'info' | 'warn' | 'error' | 'debug' | 'verbose';

const LEVEL_CONFIG: Record<LogLevel, { symbol: string; label: string; color: (s: string) => string }> = {
  info:    { symbol: '◆', label: 'INFO ', color: safeColors.info },
  warn:    { symbol: '⚠', label: 'WARN ', color: safeColors.warning },
  error:   { symbol: '✗', label: 'ERROR', color: safeColors.error },
  debug:   { symbol: '○', label: 'DEBUG', color: safeColors.muted },
  verbose: { symbol: '·', label: 'VERB ', color: safeColors.muted },
};

function timestamp(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export function logLine(level: LogLevel, message: string): string {
  const cfg = LEVEL_CONFIG[level];
  const sym = cfg.color(cfg.symbol);
  const lbl = safeColors.muted(cfg.label);
  const ts = safeColors.muted(timestamp());
  return `  ${sym} ${lbl}  ${ts}  ${message}`;
}

export function logGroup(title: string, lines: string[]): string {
  const header = `  ${safeColors.bold(title)}`;
  const body = lines.map((l) => `    ${l}`).join('\n');
  return body ? `${header}\n${body}` : header;
}

export function printLog(level: LogLevel, message: string): void {
  process.stdout.write(logLine(level, message) + '\n');
}
