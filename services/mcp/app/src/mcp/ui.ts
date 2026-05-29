/**
 * BufferedUI — a UIFacade implementation that captures all output into a string
 * buffer instead of writing to a TTY. Used to run plugin commands headlessly and
 * return their textual output as an MCP tool result.
 *
 * Output methods append to the buffer. Interactive methods return safe,
 * non-blocking defaults (mirroring the canonical noopUI) because an MCP tool call
 * is non-interactive — there is no human to answer a prompt.
 */

import { noopUI } from '@kb-labs/plugin-contracts';
import type { UIFacade } from '@kb-labs/plugin-contracts';

export interface BufferedUI {
  ui: UIFacade;
  getOutput: () => string;
}

function stringifyError(error: Error | string): string {
  return typeof error === 'string' ? error : error.message;
}

export function createBufferedUI(): BufferedUI {
  const lines: string[] = [];
  const push = (text: string): void => {
    lines.push(text);
  };

  const ui: UIFacade = {
    colors: noopUI.colors,
    symbols: noopUI.symbols,
    write: (text) => push(text),
    info: (message) => push(`[info] ${message}`),
    success: (message) => push(`[ok] ${message}`),
    warn: (message) => push(`[warn] ${message}`),
    error: (error) => push(`[error] ${stringifyError(error)}`),
    debug: (message) => push(`[debug] ${message}`),
    spinner: (message) => {
      push(`[spinner] ${message}`);
      return {
        update: (m) => push(`[spinner] ${m}`),
        succeed: (m) => push(`[ok] ${m ?? ''}`.trimEnd()),
        fail: (m) => push(`[fail] ${m ?? ''}`.trimEnd()),
        stop: () => {},
      };
    },
    table: (data) => push(JSON.stringify(data)),
    json: (data) => push(JSON.stringify(data)),
    newline: () => push(''),
    divider: () => push('---'),
    box: (content, title) => push(title ? `[${title}]\n${content}` : content),
    sideBox: (options) => {
      push(`[${options.title}]`);
      if (options.summary) {
        push(JSON.stringify(options.summary));
      }
    },
    chain: (items) => items.forEach((item) => push(`• ${item.title}`)),
    log: (entry) => push(`[${entry.level}] ${entry.message}`),
    // Non-interactive defaults — same semantics as noopUI.
    confirm: async (message, options) => {
      push(`[confirm] ${message}`);
      return options?.defaultValue ?? true;
    },
    prompt: async (message, options) => {
      push(`[prompt] ${message}`);
      return options?.default ?? '';
    },
    select: async (message, choices) => {
      push(`[select] ${message}`);
      return choices[0]?.value as never;
    },
    multiSelect: async (message, choices) => {
      push(`[multiSelect] ${message}`);
      return choices.filter((c) => c.checked).map((c) => c.value) as never;
    },
  };

  return { ui, getOutput: () => lines.join('\n') };
}
