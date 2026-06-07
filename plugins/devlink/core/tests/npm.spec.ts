import { describe, it, expect, vi } from 'vitest';

const mockSpawnSync = vi.fn();

vi.mock('child_process', () => ({
  spawnSync: mockSpawnSync,
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
