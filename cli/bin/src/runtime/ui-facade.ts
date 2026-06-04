/**
 * CLI UI Facade factory.
 *
 * Constructs a UIFacade for the CLI host using sideBorderBox for rich terminal output.
 * Accepts an optional presenter to delegate spinner, debug, and table output.
 */

import { sideBorderBox, sideBorderChain, safeColors, safeSymbols, formatTable, logLine, confirm as promptConfirm, text as promptText, select as promptSelect, multiSelect as promptMultiSelect } from '@kb-labs/shared-cli-ui';
import type { UIFacade, UILogEntry, MessageOptions, Spinner, SelectChoice, MultiSelectChoice, TableColumn, ChainItem } from '@kb-labs/plugin-contracts';

// Workspace root — used to shorten absolute paths in stack traces
const WORKSPACE_ROOT = process.cwd();

/**
 * Format Error stack into display lines.
 * - Paths shortened to relative from workspace root
 * - node:internal/ frames dimmed (not hidden — errors must be readable)
 * - Each frame on its own line for clarity
 */
function formatErrorStack(err: Error): Array<string | { text: string; dim: boolean }> {
  if (!err.stack) {return [];}

  const lines = err.stack.split('\n');
  // Skip first line — it's the error message, already shown above
  const frameLines = lines.slice(1);

  return frameLines
    .map(line => line.trim())
    .filter(line => line.startsWith('at '))
    .map(line => {
      // Shorten absolute paths to relative
      const shortened = line.replace(WORKSPACE_ROOT + '/', '');
      // Dim node internals and node_modules — they're context, not user code
      const isInternal = shortened.includes('node:internal/') || shortened.includes('node_modules/');
      return { text: shortened, dim: isInternal };
    });
}

interface PresenterDelegate {
  debug?: (msg: string) => void;
  spinner?: (text: string) => Spinner;
  table?: (data: Record<string, unknown>[]) => void;
}

export function createCLIUIFacade(presenter?: PresenterDelegate): UIFacade {
  return {
    colors: safeColors,
    symbols: safeSymbols,

    write: (text: string) => {
      const output = text.endsWith('\n') ? text : text + '\n';
      process.stdout.write(output);
    },

    info: (msg: string, options?: MessageOptions) => {
      const sections = options?.sections?.map(s => ({ header: s.header, items: s.items })) ?? [];
      const boxOutput = sideBorderBox({
        title: options?.title ?? 'Info',
        sections: [{ items: [msg] }, ...sections],
        status: 'info',
        timing: options?.timing,
        summary: options?.summary,
      });
      console.log(boxOutput);
    },

    success: (msg: string, options?: MessageOptions) => {
      const sections = options?.sections?.map(s => ({ header: s.header, items: s.items })) ?? [];
      const boxOutput = sideBorderBox({
        title: options?.title ?? 'Success',
        sections: [{ items: [msg] }, ...sections],
        status: 'success',
        timing: options?.timing,
        summary: options?.summary,
      });
      console.log(boxOutput);
    },

    warn: (msg: string, options?: MessageOptions) => {
      const sections = options?.sections?.map(s => ({ header: s.header, items: s.items })) ?? [];
      const boxOutput = sideBorderBox({
        title: options?.title ?? 'Warning',
        sections: [{ items: [msg] }, ...sections],
        status: 'warning',
        timing: options?.timing,
        summary: options?.summary,
      });
      console.log(boxOutput);
    },

    error: (err: Error | string, options?: MessageOptions) => {
      const message = err instanceof Error ? err.message : err;
      const sections: Array<{ header?: string; items: Array<string | { text: string; dim?: boolean }> }> = [
        { items: [message] },
      ];

      if (options?.sections && options.sections.length > 0) {
        sections.push(...options.sections.map(s => ({ header: s.header, items: s.items })));
      }

      // Cause — shown muted below the message
      if (options?.cause) {
        sections.push({
          header: 'Cause',
          items: [{ text: options.cause, dim: true }],
        });
      }

      // Stack trace — for unexpected Error objects (not plain strings, no custom sections)
      if (err instanceof Error && err.stack && !options?.sections) {
        const stackLines = formatErrorStack(err);
        if (stackLines.length > 0) {
          sections.push({ header: 'Stack', items: stackLines });
        }
      }

      // Hint — what to do next
      if (options?.hint) {
        const hintItems: Array<string | { text: string; dim: boolean }> = [options.hint];
        if (options.command) {
          hintItems.push({ text: `$ ${options.command}`, dim: true });
        }
        sections.push({ header: 'Hint', items: hintItems });
      } else if (options?.command) {
        sections.push({ header: 'Hint', items: [{ text: `$ ${options.command}`, dim: true }] });
      }

      const boxOutput = sideBorderBox({
        title: options?.title ?? 'Error',
        sections,
        status: 'error',
        timing: options?.timing,
        summary: options?.summary,
      });
      console.error(boxOutput);
    },

    debug: (msg: string) => {
      if (presenter?.debug) {
        presenter.debug(msg);
      } else {
        console.debug(msg);
      }
    },

    spinner: (text: string): Spinner => {
      return presenter?.spinner?.(text) ?? {
        update: () => {},
        succeed: () => {},
        fail: () => {},
        stop: () => {},
      };
    },

    table: (data: Record<string, unknown>[], columns?: TableColumn[]) => {
      if (presenter?.table) {
        presenter.table(data);
        return;
      }
      if (data.length === 0) {return;}
      const cols: TableColumn[] = columns ?? Object.keys(data[0]!).map(k => ({ header: k, key: k }));
      const rows = data.map(row => cols.map(col => String(row[col.key] ?? '')));
      const lines = formatTable(
        cols.map(c => ({ header: c.header, width: c.width, align: c.align })),
        rows,
        { separator: '' },
      );
      for (const line of lines) {
        console.log(`  ${line}`);
      }
    },

    json: (data: unknown, options?: { pretty?: boolean }) => {
      console.log(options?.pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data));
    },

    newline: () => {
      console.log();
    },

    divider: () => {
      console.log('─'.repeat(process.stdout.columns || 80));
    },

    box: (content: string, title?: string) => {
      const boxOutput = sideBorderBox({
        title: title || '',
        sections: [{ items: content.split('\n') }],
        status: 'info',
      });
      console.log(boxOutput);
    },

    sideBox: (options) => {
      const boxOutput = sideBorderBox({
        title: options.title,
        sections: options.sections?.map(s => ({ header: s.header, items: s.items })) ?? [],
        status: options.status,
        timing: options.timing,
        summary: options.summary,
      });
      console.log(boxOutput);
    },

    chain: (items: ChainItem[]) => {
      const chainOutput = sideBorderChain(
        items.map(item => ({
          title: item.title,
          sections: (item.sections ?? []).map(s => ({ header: s.header, items: s.items })),
          summary: item.summary,
          status: item.status,
          timing: item.timing,
        })),
      );
      console.log(chainOutput);
    },

    confirm: async (message: string, options?) => {
      return promptConfirm({ message, defaultValue: options?.defaultValue ?? false });
    },

    prompt: async (message: string, options?) => {
      return promptText({ message, defaultValue: options?.default, mask: options?.mask });
    },

    select: async <T>(message: string, choices: SelectChoice<T>[]) => {
      return promptSelect({ message, choices });
    },

    multiSelect: async <T>(message: string, choices: MultiSelectChoice<T>[]) => {
      return promptMultiSelect({ message, choices });
    },

    log: (entry: UILogEntry) => {
      process.stdout.write(logLine(entry.level as 'info' | 'warn' | 'error' | 'debug', entry.message) + '\n');
    },
  };
}
