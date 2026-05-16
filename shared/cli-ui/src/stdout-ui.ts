import type { UIFacade, SelectChoice, MultiSelectChoice } from '@kb-labs/plugin-contracts';
import { safeColors, safeSymbols } from './colors.js';
import { sideBorderBox, sideBorderChain, metricsList } from './modern-format.js';
import { formatTable } from './table.js';

/**
 * All interactive prompt methods of UIFacade.
 * Required (not optional) so TypeScript catches missing implementations
 * when UIFacade gains a new prompt method.
 */
export interface UIPrompts {
  confirm(msg: string, opts?: { defaultValue?: boolean }): Promise<boolean>;
  prompt(msg: string, opts?: { default?: string; mask?: boolean }): Promise<string>;
  select<T>(msg: string, choices: SelectChoice<T>[]): Promise<T>;
  multiSelect<T>(msg: string, choices: MultiSelectChoice<T>[]): Promise<T[]>;
}

/**
 * Safe-return prompts for non-interactive contexts (subprocess, sandbox).
 * All methods return the most sensible default without any I/O.
 */
export const NOOP_PROMPTS: UIPrompts = {
  confirm: async (_, opts) => opts?.defaultValue ?? false,
  prompt: async (_, opts) => opts?.default ?? '',
  select: async <T>(_: string, choices: SelectChoice<T>[]) => choices[0]?.value as T,
  multiSelect: async <T>(_: string, choices: MultiSelectChoice<T>[]) =>
    choices.filter(c => c.checked).map(c => c.value) as T[],
};

/**
 * Shared stdout UIFacade factory for subprocess/worker contexts.
 *
 * Both params are required so TypeScript catches any new UIFacade interactive
 * method at the call site rather than silently inheriting a noop default.
 *
 * Uses `satisfies UIFacade` on the object literal — TypeScript will error here
 * (not just at the return type) if any UIFacade method is missing.
 */
export function createBaseStdoutUI(
  prompts: UIPrompts,
  log: UIFacade['log'],
): UIFacade {
  return {
    colors: safeColors,
    symbols: safeSymbols,

    write: (text) => { process.stdout.write(text + '\n'); },

    info: (msg, options) => {
      const extra = options?.sections ?? [];
      console.log(sideBorderBox({
        title: options?.title ?? 'Info',
        sections: [{ items: [msg] }, ...extra],
        status: 'info',
        timing: options?.timing,
        summary: options?.summary,
      }));
    },

    success: (msg, options) => {
      const extra = options?.sections ?? [];
      console.log(sideBorderBox({
        title: options?.title ?? 'Success',
        sections: [{ items: [msg] }, ...extra],
        status: 'success',
        timing: options?.timing,
        summary: options?.summary,
      }));
    },

    warn: (msg, options) => {
      const extra = options?.sections ?? [];
      console.log(sideBorderBox({
        title: options?.title ?? 'Warning',
        sections: [{ items: [msg] }, ...extra],
        status: 'warning',
        timing: options?.timing,
        summary: options?.summary,
      }));
    },

    error: (err, options) => {
      const message = err instanceof Error ? err.message : err;
      const sections: Array<{ header?: string; items: Array<string | { text: string; dim?: boolean }> }> = [
        { items: [message] },
      ];

      if (options?.sections?.length) {
        sections.push(...options.sections.map(s => ({ header: s.header, items: s.items })));
      }

      if (options?.cause) {
        sections.push({ header: 'Cause', items: [{ text: options.cause, dim: true }] });
      }

      if (options?.hint) {
        const hintItems: Array<string | { text: string; dim: boolean }> = [options.hint];
        if (options.command) { hintItems.push({ text: `$ ${options.command}`, dim: true }); }
        sections.push({ header: 'Hint', items: hintItems });
      } else if (options?.command) {
        sections.push({ header: 'Hint', items: [{ text: `$ ${options.command}`, dim: true }] });
      }

      console.error(sideBorderBox({
        title: options?.title ?? 'Error',
        sections,
        status: 'error',
        timing: options?.timing,
        summary: options?.summary,
      }));
    },

    debug: (msg) => { if (process.env.DEBUG) { console.debug(msg); } },

    spinner: (msg) => {
      console.log(`${safeColors.primary('◆')} ${msg}`);
      return {
        update: (m) => console.log(`${safeColors.primary('◆')} ${m}`),
        succeed: (m) => console.log(`${safeColors.success('✓')} ${m ?? msg}`),
        fail: (m) => console.log(`${safeColors.error('✗')} ${m ?? msg}`),
        stop: () => {},
      };
    },

    table: (data, columns) => {
      if (data.length === 0) { return; }
      const cols = columns ?? Object.keys(data[0]!).map(k => ({ header: k, key: k }));
      const rows = data.map(row => cols.map(col => String(row[col.key] ?? '')));
      const lines = formatTable(
        cols.map(c => ({ header: c.header, align: (c as { align?: 'left' | 'center' | 'right' }).align })),
        rows,
        { separator: '' },
      );
      for (const line of lines) { console.log(`  ${line}`); }
    },

    json: (data) => console.log(JSON.stringify(data, null, 2)),
    newline: () => console.log(),
    divider: () => console.log(safeColors.muted('─'.repeat(process.stdout.columns || 80))),

    box: (content, title) => {
      console.log(sideBorderBox({
        title: title || '',
        sections: [{ items: content.split('\n') }],
        status: 'info',
      }));
    },

    sideBox: (options) => {
      const allSections: Array<{ header?: string; items: Array<string | { text: string; dim?: boolean }> }> = [];
      if (options.summary && Object.keys(options.summary).length > 0) {
        allSections.push({ items: metricsList(options.summary as Record<string, string | number>) });
      }
      allSections.push(...(options.sections ?? []).map(s => ({ header: s.header, items: s.items })));
      console.log(sideBorderBox({
        title: options.title,
        sections: allSections,
        status: options.status,
        timing: options.timing,
      }));
    },

    chain: (items) => {
      console.log(sideBorderChain(
        items.map(item => ({
          title: item.title,
          sections: (item.sections ?? []).map(s => ({ header: s.header, items: s.items })),
          summary: item.summary,
          status: item.status,
          timing: item.timing,
        })),
      ));
    },

    confirm: prompts.confirm,
    prompt: prompts.prompt,
    select: prompts.select,
    multiSelect: prompts.multiSelect,
    log,
  } satisfies UIFacade;
}
