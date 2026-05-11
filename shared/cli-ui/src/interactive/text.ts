/**
 * Interactive text input prompt.
 *
 * @example
 * const name = await text({ message: 'Plugin name', placeholder: 'my-plugin', validate: v => v ? undefined : 'Required' })
 */

import * as readline from 'node:readline';
import { safeColors } from '../colors.js';
import { isInteractive } from './terminal.js';

export interface TextOptions {
  message: string;
  placeholder?: string;
  defaultValue?: string;
  validate?: (value: string) => string | undefined;
  mask?: boolean;
}

export async function text(options: TextOptions): Promise<string> {
  const { message, placeholder, defaultValue = '', validate, mask = false } = options;

  if (!isInteractive()) {
    return defaultValue;
  }

  const hint = placeholder ? safeColors.muted(` (${placeholder})`) : '';
  process.stdout.write(`${safeColors.primary('◆')}  ${safeColors.bold(message)}${hint}\n`);
  process.stdout.write(`${safeColors.muted('│')}  `);

  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: mask ? undefined : process.stdout,
      terminal: !mask,
    });

    if (mask) {
      process.stdin.on('data', (char) => {
        const c = char.toString();
        if (c === '\n' || c === '\r') {return;}
        process.stdout.write('*');
      });
    }

    rl.once('line', (line) => {
      rl.close();
      const value = line.trim() || defaultValue;

      if (validate) {
        const error = validate(value);
        if (error) {
          process.stdout.write(`${safeColors.error('✗')}  ${safeColors.error(error)}\n`);
          resolve(text(options));
          return;
        }
      }

      process.stdout.write(`${safeColors.muted('└')}\n`);
      resolve(value);
    });

    rl.once('close', () => {
      resolve(defaultValue);
    });
  });
}
