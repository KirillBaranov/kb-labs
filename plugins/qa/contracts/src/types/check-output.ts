/**
 * Structured output types for QA checks.
 * Checks with parser:"json" should return TypedCheckOutput on stdout.
 */

/**
 * A single actionable finding from a check.
 */
export interface CheckItem {
  /** File path, package name, or other target identifier */
  target: string;
  /** Human-readable description of the issue */
  message: string;
  /** Concrete action for the agent to take (optional) */
  fix?: string;
}

/**
 * Structured JSON output expected from checks with parser:"json".
 * The check script should write this to stdout.
 *
 * @example
 * process.stdout.write(JSON.stringify({
 *   ok: false,
 *   items: [
 *     { target: 'src/foo.ts', message: 'no test file found', fix: 'create src/foo.test.ts' }
 *   ]
 * }));
 */
export interface TypedCheckOutput {
  ok: boolean;
  items?: CheckItem[];
}
