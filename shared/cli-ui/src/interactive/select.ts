/**
 * Interactive arrow-key single-select prompt.
 *
 * @example
 * const env = await select({
 *   message: 'Select environment',
 *   choices: [{ label: 'development', value: 'dev' }, { label: 'production', value: 'prod' }]
 * })
 */

import { safeColors } from '../colors.js';
import {
  isInteractive, enableRawMode, disableRawMode,
  hideCursor, showCursor, clearLines,
  onKeypress, isUpKey, isDownKey, isEnterKey, isEscapeKey,
} from './terminal.js';

export interface SelectChoice<T> {
  label: string;
  value: T;
  hint?: string;
}

export interface SelectOptions<T> {
  message: string;
  choices: SelectChoice<T>[];
  initialIndex?: number;
}

function renderSelect<T>(message: string, choices: SelectChoice<T>[], activeIndex: number, isFirst: boolean): number {
  const lines: string[] = [];

  if (isFirst) {
    lines.push(`${safeColors.primary('◆')}  ${safeColors.bold(message)}`);
    lines.push(safeColors.muted('│'));
  }

  for (let i = 0; i < choices.length; i++) {
    const choice = choices[i];
    if (!choice) {continue;}
    const isActive = i === activeIndex;
    const pointer = isActive ? safeColors.primary('❯') : ' ';
    const label = isActive ? safeColors.bold(choice.label) : safeColors.muted(choice.label);
    const hint = choice.hint ? safeColors.muted(` — ${choice.hint}`) : '';
    lines.push(`${safeColors.muted('│')}  ${pointer} ${label}${hint}`);
  }

  lines.push(safeColors.muted('│'));
  process.stdout.write(lines.join('\n') + '\n');
  return lines.length;
}

export async function select<T>(options: SelectOptions<T>): Promise<T> {
  const { message, choices, initialIndex = 0 } = options;

  if (!isInteractive() || choices.length === 0) {
    return (choices[Math.min(initialIndex, choices.length - 1)] as SelectChoice<T>).value;
  }

  let activeIndex = Math.min(initialIndex, choices.length - 1);
  let lineCount = 0;

  hideCursor();
  enableRawMode();
  lineCount = renderSelect(message, choices, activeIndex, true);

  return new Promise((resolve) => {
    const unsubscribe = onKeypress((key) => {
      if (isUpKey(key)) {
        activeIndex = (activeIndex - 1 + choices.length) % choices.length;
        clearLines(lineCount);
        lineCount = renderSelect(message, choices, activeIndex, false);
        return;
      }

      if (isDownKey(key)) {
        activeIndex = (activeIndex + 1) % choices.length;
        clearLines(lineCount);
        lineCount = renderSelect(message, choices, activeIndex, false);
        return;
      }

      if (isEnterKey(key)) {
        unsubscribe();
        disableRawMode();
        showCursor();
        clearLines(lineCount + 2);
        const selected = choices[activeIndex] as SelectChoice<T>;
        process.stdout.write(`${safeColors.primary('◆')}  ${safeColors.bold(message)}  ${safeColors.muted(selected.label)}\n`);
        process.stdout.write(`${safeColors.muted('└')}\n`);
        resolve(selected.value);
        return;
      }

      if (isEscapeKey(key)) {
        unsubscribe();
        disableRawMode();
        showCursor();
        clearLines(lineCount + 2);
        process.stdout.write(`${safeColors.muted('◆')}  ${safeColors.muted(message)}  ${safeColors.muted('cancelled')}\n`);
        process.stdout.write(`${safeColors.muted('└')}\n`);
        resolve((choices[initialIndex] as SelectChoice<T>).value);
        return;
      }
    });
  });
}
