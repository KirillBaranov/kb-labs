/**
 * Manifest utilities for V3 plugins
 *
 * Re-exports from shared-command-kit for convenience.
 */

// Re-export manifest utilities from shared-command-kit
export { defineManifest, defineCommandFlags } from '@kb-labs/shared-command-kit';
// TODO: V3 migration - permissions helpers need to be rewritten for V3 PermissionSpec structure
// export { permissions } from '@kb-labs/shared-command-kit';

/**
 * Generate command examples for V3 manifests
 *
 * Simple helper to format command examples from flag cases.
 *
 * @example
 * ```typescript
 * examples: generateExamples('hello', 'plugin-template', [
 *   { description: 'Basic greeting', flags: {} },
 *   { description: 'Greet specific name', flags: { name: 'Developer' } },
 *   { description: 'Output as JSON', flags: { json: true } }
 * ])
 * ```
 */
export interface ExampleCase {
  flags: Record<string, unknown>;
  description?: string;
}

export function generateExamples(
  commandName: string,
  productName: string,
  cases: ExampleCase[]
): string[] {
  return cases.map(c => {
    const flagsStr = Object.entries(c.flags)
      .map(([k, v]) => {
        if (typeof v === 'boolean') {
          return v ? `--${k}` : '';
        }
        return `--${k}=${v}`;
      })
      .filter(Boolean)
      .join(' ');

    const cmd = `${productName} ${commandName}${flagsStr ? ' ' + flagsStr : ''}`;
    return c.description ? `${cmd} # ${c.description}` : cmd;
  });
}
