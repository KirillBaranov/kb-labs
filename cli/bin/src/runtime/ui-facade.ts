/**
 * CLI UI Facade factory.
 *
 * Constructs a UIFacade for the CLI host using sideBorderBox for rich terminal output.
 * Accepts an optional presenter to delegate spinner, debug, and table output.
 */

import { sideBorderBox, safeColors, safeSymbols } from '@kb-labs/shared-cli-ui';
import type { UIFacade, MessageOptions, Spinner } from '@kb-labs/plugin-contracts';

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
      const sections = options?.sections?.map(s => ({ header: s.header, items: s.items })) || [{ items: [msg] }];
      const boxOutput = sideBorderBox({
        title: options?.title || 'Info',
        sections,
        status: 'info',
        timing: options?.timing,
      });
      console.log(boxOutput);
    },

    success: (msg: string, options?: MessageOptions) => {
      const sections = options?.sections?.map(s => ({ header: s.header, items: s.items })) || [{ items: [msg] }];
      const boxOutput = sideBorderBox({
        title: options?.title || 'Success',
        sections,
        status: 'success',
        timing: options?.timing,
      });
      console.log(boxOutput);
    },

    warn: (msg: string, options?: MessageOptions) => {
      const sections = options?.sections?.map(s => ({ header: s.header, items: s.items })) || [{ items: [msg] }];
      const boxOutput = sideBorderBox({
        title: options?.title || 'Warning',
        sections,
        status: 'warning',
        timing: options?.timing,
      });
      console.log(boxOutput);
    },

    error: (err: Error | string, options?: MessageOptions) => {
      const message = err instanceof Error ? err.message : err;
      const sections = options?.sections?.map(s => ({ header: s.header, items: s.items })) || [{ items: [message] }];
      const boxOutput = sideBorderBox({
        title: options?.title || 'Error',
        sections,
        status: 'error',
        timing: options?.timing,
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

    table: (data: Record<string, unknown>[], _columns?) => {
      if (presenter?.table) {
        presenter.table(data);
      } else {
        console.table(data);
      }
    },

    json: (data: unknown) => {
      console.log(JSON.stringify(data, null, 2));
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
        sections: options.sections ?? [],
        status: options.status,
        timing: options.timing,
      });
      console.log(boxOutput);
    },

    confirm: async (_message: string) => true,
    prompt: async (_message: string, _options?) => '',
  };
}
