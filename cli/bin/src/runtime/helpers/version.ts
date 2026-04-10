/**
 * Version resolution helpers
 */

/**
 * Resolve CLI version from options or env
 */
export function resolveVersion(
  optionsVersion: string | undefined,
  env: NodeJS.ProcessEnv,
): string {
  return optionsVersion ?? env.KB_VERSION ?? 'unknown';
}
