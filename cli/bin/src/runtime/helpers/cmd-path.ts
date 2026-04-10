/**
 * Command path normalization helpers
 */

/**
 * Normalize command path by converting colon-separated format to array
 * e.g., ["product:setup"] -> ["product", "setup"]
 */
export function normalizeCmdPath(argvCmd: string[]): string[] {
  if (argvCmd.length === 1 && argvCmd[0]?.includes(':')) {
    return argvCmd[0].split(':');
  }
  return argvCmd;
}
