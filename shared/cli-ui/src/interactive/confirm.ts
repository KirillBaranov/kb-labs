/**
 * Interactive y/n confirmation prompt.
 *
 * @example
 * const ok = await confirm({ message: 'Deploy to production?', defaultValue: false })
 */

import * as readline from 'node:readline';
import { safeColors } from '../colors.js';
import { isInteractive } from './terminal.js';

export interface ConfirmOptions {
  message: string;
  defaultValue?: boolean;
}

export async function confirm(options: ConfirmOptions): Promise<boolean> {
  const { message, defaultValue = false } = options;

  if (!isInteractive()) {
    return defaultValue;
  }

  const hint = defaultValue ? '(Y/n)' : '(y/N)';
  process.stdout.write(`${safeColors.primary('◆')}  ${safeColors.bold(message)} ${safeColors.muted(hint)} `);

  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: undefined });

    rl.once('line', (line) => {
      rl.close();
      const trimmed = line.trim().toLowerCase();
      process.stdout.write('\n');
      if (trimmed === '') {
        resolve(defaultValue);
      } else {
        resolve(trimmed === 'y' || trimmed === 'yes');
      }
    });

    rl.once('close', () => {
      resolve(defaultValue);
    });
  });
}
