/**
 * @module @kb-labs/core/config/errors
 * Standardized error class for KB Labs with exit code mapping
 */

export class KbError extends Error {
  constructor(
    public code: string,
    message: string,
    public hint?: string,
    public meta?: any
  ) {
    super(message);
    this.name = 'KbError';
  }
}

/**
 * Maps KbError codes to CLI exit codes
 */
export function getExitCode(err: KbError): number {
  if (err.code === 'ERR_FORBIDDEN') {return 3;}
  if (err.code === 'ERR_CONFIG_NOT_FOUND') {return 2;}
  if (err.code === 'ERR_CONFIG_EXISTS_CONFLICT') {return 2;}
  if (err.code === 'ERR_PATH_OUTSIDE_WORKSPACE') {return 2;}
  if (err.code.startsWith('ERR_')) {return 1;}
  return 1;
}

/**
 * Error codes with their standard hints
 */
export const ERROR_HINTS = {
  ERR_CONFIG_NOT_FOUND: 'Create .kb/kb-labs.config.yaml or run: kb init',
  ERR_CONFIG_INVALID: 'Check configuration syntax and required fields',
  ERR_CONFIG_EXISTS_CONFLICT: 'Use --force to overwrite existing configuration',
  ERR_PATH_OUTSIDE_WORKSPACE: 'Check cwd or use a relative path within the workspace',
  ERR_PRESET_NOT_RESOLVED: 'Install the required preset package or check network connectivity',
  ERR_PROFILE_INCOMPATIBLE: 'Profile version is incompatible with current system',
  ERR_PROFILE_NOT_DEFINED: 'Add profiles[] to kb.config.json or pass --profile=<id>',
  ERR_PROFILE_RESOLVE_FAILED: 'Profile registry unavailable. Define profiles[] inside kb.config.json or use workspace presets.',
  ERR_PROFILE_EXTENDS_FAILED: 'Profile extends failed. Check extends reference or install required preset/package.',
  ERR_PROFILE_SCOPE_NOT_FOUND: 'Scope not found. Use --scope=<id> with one of the configured scopes.',
  ERR_PROFILE_SCOPE_CONFLICT: 'Multiple scopes matched. Specify --scope=<id> explicitly.',
  ERR_PROFILE_INVALID_FORMAT: 'Update profiles[] in kb.config.json (Profiles v2) or rerun your plugin setup command.',
  ERR_ARTIFACT_LIMIT_EXCEEDED: 'Remove or split large artifacts, or reduce artifact count',
  ERR_FORBIDDEN: 'Add role in policy.overrides or use preset...',
} as const;

export type ErrorCode = keyof typeof ERROR_HINTS;
