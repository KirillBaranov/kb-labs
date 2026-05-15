import { noopUI } from '@kb-labs/plugin-contracts';
import type { UIFacade, UILogEntry, MessageOptions, TableColumn } from '@kb-labs/plugin-contracts';

export interface UICapture {
  /** Arguments passed to ctx.ui.json() */
  json: unknown[];
  /** Arguments passed to ctx.ui.table() */
  table: Array<{ rows: Record<string, unknown>[]; columns?: TableColumn[] }>;
  /** Arguments passed to ctx.ui.success() */
  success: Array<{ message: string; opts?: MessageOptions }>;
  /** First argument of ctx.ui.warn() calls */
  warnings: Array<{ message: string; opts?: MessageOptions }>;
  /** First argument of ctx.ui.error() calls (message or Error.message) */
  errors: string[];
  /** Arguments passed to ctx.ui.info() */
  infos: Array<{ message: string; opts?: MessageOptions }>;
  /** Arguments passed to ctx.ui.log() */
  logs: UILogEntry[];
  /** Raw strings passed to ctx.ui.write() */
  writes: string[];
}

export interface CapturedUI {
  ui: UIFacade;
  captured: UICapture;
}

/**
 * Creates a UIFacade that records all calls for assertion in handler tests.
 * Non-captured methods fall through to noopUI (spinner, confirm, etc.).
 */
export function createCapturedUI(): CapturedUI {
  const captured: UICapture = {
    json: [],
    table: [],
    success: [],
    warnings: [],
    errors: [],
    infos: [],
    logs: [],
    writes: [],
  };

  const ui: UIFacade = {
    ...noopUI,

    write(text: string): void {
      captured.writes.push(text);
    },

    info(message: string, opts?: MessageOptions): void {
      captured.infos.push({ message, opts });
    },

    success(message: string, opts?: MessageOptions): void {
      captured.success.push({ message, opts });
    },

    warn(message: string, opts?: MessageOptions): void {
      captured.warnings.push({ message, opts });
    },

    error(error: Error | string, opts?: MessageOptions): void {
      captured.errors.push(typeof error === 'string' ? error : error.message);
      if (opts) {
        captured.warnings.push({ message: typeof error === 'string' ? error : error.message, opts });
      }
    },

    json(data: unknown): void {
      captured.json.push(data);
    },

    table(data: Record<string, unknown>[], columns?: TableColumn[]): void {
      captured.table.push({ rows: data, columns });
    },

    log(entry: UILogEntry): void {
      captured.logs.push(entry);
    },
  };

  return { ui, captured };
}
