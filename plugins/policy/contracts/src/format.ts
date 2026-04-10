import type { PolicyViolation } from './types.js';

/**
 * Options that control which parts of a {@link PolicyViolation} are included
 * in the formatted string.
 */
export interface FormatViolationOptions {
  /**
   * Include the `file` field as a path hint when it is present.
   * @default true
   */
  includeFile?: boolean;

  /**
   * Include the `detail` field as an indented continuation line when present.
   * @default true
   */
  includeDetail?: boolean;

  /**
   * Include the `package` field as a parenthetical suffix on the first line
   * when it is present.
   * @default false
   */
  includePackage?: boolean;
}

/**
 * Formats a single {@link PolicyViolation} into a human-readable string that
 * mirrors the canonical CLI output produced by `policy:check`.
 *
 * The returned string is **never** terminated with a newline so callers can
 * join multiple violations however they like (e.g. `'\n'` for terminal output,
 * `'<br>'` for HTML).
 *
 * Layout (each line only emitted when the corresponding field is present and
 * its option is enabled):
 *
 * ```
 * [severity] rule — message (package)
 *   → detail
 *   @ file
 * ```
 *
 * @example
 * ```ts
 * import { formatViolation } from '@kb-labs/policy-contracts';
 *
 * const line = formatViolation(violation);
 * // "[error] boundary-check — pkg-a depends on pkg-b (category: plugins)"
 *
 * const withDetail = formatViolation(violation, { includeDetail: true });
 * // "[error] boundary-check — pkg-a depends on pkg-b (category: plugins)\n  → Category "platform" may only depend on: shared"
 * ```
 */
export function formatViolation(
  violation: PolicyViolation,
  options: FormatViolationOptions = {},
): string {
  const { includeFile = true, includeDetail = true, includePackage = false } = options;

  const packageSuffix =
    includePackage && violation.package ? ` (${violation.package})` : '';

  const firstLine = `[${violation.severity}] ${violation.rule} — ${violation.message}${packageSuffix}`;

  const lines: string[] = [firstLine];

  if (includeDetail && violation.detail) {
    lines.push(`  → ${violation.detail}`);
  }

  if (includeFile && violation.file) {
    lines.push(`  @ ${violation.file}`);
  }

  return lines.join('\n');
}
