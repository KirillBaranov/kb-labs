/**
 * Generate command examples
 * Simple helper to format command examples for CLI commands
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
