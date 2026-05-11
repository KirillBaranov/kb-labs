/**
 * Interactive checkbox multi-select prompt.
 * Space to toggle, Enter to confirm, 'a' to toggle all.
 *
 * @example
 * const plugins = await multiSelect({
 *   message: 'Select plugins',
 *   choices: [{ label: 'workflow', value: 'workflow', checked: true }, ...]
 * })
 */

import { safeColors } from '../colors.js';
import {
  isInteractive, enableRawMode, disableRawMode,
  hideCursor, showCursor, clearLines,
  onKeypress, isUpKey, isDownKey, isEnterKey, isEscapeKey, isSpaceKey,
} from './terminal.js';

export interface MultiSelectChoice<T> {
  label: string;
  value: T;
  checked?: boolean;
  hint?: string;
}

export interface MultiSelectOptions<T> {
  message: string;
  choices: MultiSelectChoice<T>[];
  min?: number;
}

function renderMultiSelect<T>(
  message: string,
  choices: MultiSelectChoice<T>[],
  checked: Set<number>,
  activeIndex: number,
  isFirst: boolean,
  error?: string,
): number {
  const lines: string[] = [];

  if (isFirst) {
    lines.push(`${safeColors.primary('◆')}  ${safeColors.bold(message)}  ${safeColors.muted('Space to toggle, Enter to confirm')}`);
    lines.push(safeColors.muted('│'));
  }

  for (let i = 0; i < choices.length; i++) {
    const choice = choices[i];
    if (!choice) {continue;}
    const isActive = i === activeIndex;
    const isChecked = checked.has(i);
    const checkbox = isChecked ? safeColors.success('◉') : safeColors.muted('○');
    const pointer = isActive ? safeColors.primary('❯') : ' ';
    const label = isActive ? safeColors.bold(choice.label) : isChecked ? choice.label : safeColors.muted(choice.label);
    const hint = choice.hint ? safeColors.muted(` — ${choice.hint}`) : '';
    lines.push(`${safeColors.muted('│')}  ${pointer} ${checkbox} ${label}${hint}`);
  }

  if (error) {
    lines.push(`${safeColors.muted('│')}`);
    lines.push(`${safeColors.muted('│')}  ${safeColors.error('✗')}  ${safeColors.error(error)}`);
  }

  lines.push(safeColors.muted('│'));
  process.stdout.write(lines.join('\n') + '\n');
  return lines.length;
}

export async function multiSelect<T>(options: MultiSelectOptions<T>): Promise<T[]> {
  const { message, choices, min } = options;

  if (!isInteractive() || choices.length === 0) {
    return choices.filter((c) => c.checked).map((c) => c.value);
  }

  let activeIndex = 0;
  const checked = new Set<number>(
    choices.map((c, i) => (c.checked ? i : -1)).filter((i) => i >= 0)
  );
  let lineCount = 0;
  let error: string | undefined;

  hideCursor();
  enableRawMode();
  lineCount = renderMultiSelect(message, choices, checked, activeIndex, true, error);

  return new Promise((resolve) => {
    const unsubscribe = onKeypress((key) => {
      if (isUpKey(key)) {
        activeIndex = (activeIndex - 1 + choices.length) % choices.length;
        clearLines(lineCount);
        lineCount = renderMultiSelect(message, choices, checked, activeIndex, false, error);
        return;
      }

      if (isDownKey(key)) {
        activeIndex = (activeIndex + 1) % choices.length;
        clearLines(lineCount);
        lineCount = renderMultiSelect(message, choices, checked, activeIndex, false, error);
        return;
      }

      if (isSpaceKey(key)) {
        if (checked.has(activeIndex)) {
          checked.delete(activeIndex);
        } else {
          checked.add(activeIndex);
        }
        error = undefined;
        clearLines(lineCount);
        lineCount = renderMultiSelect(message, choices, checked, activeIndex, false, error);
        return;
      }

      if (key.name === 'a' && !key.ctrl) {
        if (checked.size === choices.length) {
          checked.clear();
        } else {
          choices.forEach((_, i) => checked.add(i));
        }
        clearLines(lineCount);
        lineCount = renderMultiSelect(message, choices, checked, activeIndex, false, error);
        return;
      }

      if (isEnterKey(key)) {
        if (min !== undefined && checked.size < min) {
          error = `Select at least ${min} option${min === 1 ? '' : 's'}`;
          clearLines(lineCount);
          lineCount = renderMultiSelect(message, choices, checked, activeIndex, false, error);
          return;
        }

        unsubscribe();
        disableRawMode();
        showCursor();
        const headerLines = 2;
        clearLines(lineCount + headerLines);

        const selectedLabels = choices
          .filter((_, i) => checked.has(i))
          .map((c) => c.label)
          .join(', ');
        process.stdout.write(`${safeColors.primary('◆')}  ${safeColors.bold(message)}  ${safeColors.muted(selectedLabels || 'none')}\n`);
        process.stdout.write(`${safeColors.muted('└')}\n`);

        resolve(choices.filter((_, i) => checked.has(i)).map((c) => c.value));
        return;
      }

      if (isEscapeKey(key)) {
        unsubscribe();
        disableRawMode();
        showCursor();
        clearLines(lineCount + 2);
        process.stdout.write(`${safeColors.muted('◆')}  ${safeColors.muted(message)}  ${safeColors.muted('cancelled')}\n`);
        process.stdout.write(`${safeColors.muted('└')}\n`);
        resolve([]);
        return;
      }
    });
  });
}
