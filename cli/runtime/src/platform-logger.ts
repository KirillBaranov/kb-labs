/**
 * @module @kb-labs/cli-runtime/platform-logger
 * Logger utilities for CLI runtime. Uses ILogger from platform directly.
 */

import { platform } from '@kb-labs/core-runtime';
import type { ILogger } from '@kb-labs/core-platform';

export type { ILogger as Logger } from '@kb-labs/core-platform';
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'silent';

export function getLogger(category = 'cli'): ILogger {
  return platform.logger.child({ layer: 'cli', category });
}

export function getLogLevel(): LogLevel {
  const raw = (process.env.KB_LOG_LEVEL ?? process.env.LOG_LEVEL ?? 'info').toLowerCase();
  switch (raw) {
    case 'trace':
    case 'debug':
    case 'info':
    case 'warn':
    case 'error':
    case 'silent':
      return raw;
    default:
      return 'info';
  }
}
