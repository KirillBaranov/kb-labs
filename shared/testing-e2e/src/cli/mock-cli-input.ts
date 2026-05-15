import type { CLIInput } from '@kb-labs/shared-command-kit';

export interface MockCLIInputOptions<F> {
  flags?: Partial<F>;
  argv?: string[];
}

/**
 * Build a typed CLIInput for handler-level tests.
 * Flags not provided default to undefined (matching real CLI behavior when flag is omitted).
 */
export function mockCLIInput<F>(opts: MockCLIInputOptions<F> = {}): CLIInput<F> {
  return {
    flags: (opts.flags ?? {}) as F,
    argv: opts.argv ?? [],
  };
}
