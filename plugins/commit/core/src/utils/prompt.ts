/**
 * User confirmation prompt utilities
 */

import * as readline from 'node:readline';

/**
 * Prompt user for yes/no confirmation
 *
 * @param question - Question to ask
 * @param defaultValue - Default value if user just presses Enter
 * @param autoConfirm - If true, automatically return true without prompting (for --yes flag)
 * @returns Promise resolving to true if user confirms, false otherwise
 */
export async function promptUserConfirmation(
  question: string,
  defaultValue: boolean = false,
  autoConfirm: boolean = false
): Promise<boolean> {
  // Auto-confirm mode (--yes flag)
  if (autoConfirm) {
    console.log(`${question} [auto-confirmed with --yes]`);
    return true;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const defaultHint = defaultValue ? '[Y/n]' : '[y/N]';
  const fullQuestion = `${question} ${defaultHint}: `;

  return new Promise((resolve) => {
    rl.question(fullQuestion, (answer) => {
      rl.close();

      const normalized = answer.trim().toLowerCase();

      if (normalized === '') {
        resolve(defaultValue);
        return;
      }

      if (normalized === 'y' || normalized === 'yes') {
        resolve(true);
        return;
      }

      if (normalized === 'n' || normalized === 'no') {
        resolve(false);
        return;
      }

      // Invalid input - use default
      resolve(defaultValue);
    });
  });
}
