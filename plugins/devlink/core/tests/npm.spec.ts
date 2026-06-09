import { describe, it, expect, vi } from 'vitest';

const mockSpawnSync = vi.fn();

vi.mock('child_process', () => ({
  spawnSync: mockSpawnSync,
}));

// Hermetic: stub the SDK so the unit-under-test resolves a no-op cache instead
// of loading the real @kb-labs/sdk barrel.
//
// Why: importing @kb-labs/sdk (any entrypoint, incl. /hooks) eagerly drags
// @kb-labs/core-runtime in via shared-command-kit's top-level
// `import { platform } from '@kb-labs/core-runtime'` (helpers/use-platform.ts).
// That graph costs ~400ms cold and, under CI fork-pool contention, spikes past
// Vitest's 5s default and flakes this argv-only test. Measured: barrel & /hooks
// ~400ms vs /platform ~16ms; deps.optimizer doesn't help (dist already built,
// nothing to transpile) and can't even bundle core-runtime. This test asserts
// spawnSync argv shape — it has no business loading the real cache infra.
//
// TODO(sdk-core-decouple): drop this mock once the platform fallback in
// @kb-labs/shared-command-kit is injected/lazy instead of a static
// core-runtime import, so importing SDK hooks stops dragging the whole runtime.
vi.mock('@kb-labs/sdk', () => ({
  useCache: () => null,
}));

// Regression: getLatestNpmVersion must use spawnSync with discrete argv,
// not execSync with a template string — prevents command injection via packageName.
describe('getLatestNpmVersion — no shell injection', () => {
  it('calls spawnSync with packageName as a discrete argv element', async () => {
    mockSpawnSync.mockReturnValue({ stdout: '"1.0.0"', status: 0, error: undefined });

    const { getLatestNpmVersion } = await import('../src/npm/index.js');
    await getLatestNpmVersion('some-package');

    expect(mockSpawnSync).toHaveBeenCalled();
    const [cmd, args] = mockSpawnSync.mock.calls[0];
    expect(cmd).toBe('npm');
    expect(args).toContain('some-package');
  });

  it('treats malicious packageName as a single argv element, not a shell command', async () => {
    const malicious = 'legit; rm -rf /';
    mockSpawnSync.mockReturnValue({ stdout: '', status: 1, error: undefined });

    const { getLatestNpmVersion } = await import('../src/npm/index.js');
    const result = await getLatestNpmVersion(malicious);

    expect(result).toBeNull();
    const [, args] = mockSpawnSync.mock.calls.at(-1);
    // Must be a single discrete element — the OS never interprets it as a shell command
    expect(args).toContain(malicious);
  });
});
