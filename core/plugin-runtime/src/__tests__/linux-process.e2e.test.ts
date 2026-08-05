import { describe, expect, it } from 'vitest';
import { LinuxProcessBackend } from '../process/linux-backend.js';

describe.skipIf(process.platform !== 'linux')('Linux governed process e2e', () => {
  it('places the child process into a per-execution cgroup', async () => {
    const backend = new LinuxProcessBackend();
    const capabilities = backend.capabilities();
    if (!capabilities.hardMemoryLimit || !capabilities.maxProcesses) {
      return;
    }

    const result = await backend.execute({
      identity: { executionId: 'linux-e2e-execution', requestId: 'linux-e2e-request', pluginId: 'linux-e2e-plugin' },
      command: process.execPath,
      args: ['-e', 'process.stdout.write(require("node:fs").readFileSync("/proc/self/cgroup", "utf8"))'],
      cwd: process.cwd(),
      limits: { timeoutMs: 5000, memoryMb: 256, maxProcesses: 8 },
    });

    expect(result.ok).toBe(true);
    expect(result.stdout).toMatch(/kb-plugin-/);
    await backend.shutdown();
  });
});
