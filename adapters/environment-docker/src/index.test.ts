import { describe, expect, it, vi } from 'vitest';
import { DockerEnvironmentAdapter } from './index.js';

describe('DockerEnvironmentAdapter', () => {
  it('creates environment via docker run with expected args', async () => {
    const execDocker = vi.fn(async (args: string[]) => {
      if (args[0] === 'run') {
        return 'container-123\n';
      }
      throw new Error(`Unexpected command: ${args.join(' ')}`);
    });

    const adapter = new DockerEnvironmentAdapter({
      defaultImage: 'node:20-alpine',
      network: 'kb-net',
      workspace: { cwd: '/repo' },
      execDocker,
    });

    const env = await adapter.create({
      runId: 'RUN_MAIN',
      templateId: 'node-dev',
      env: { A: '1', B: '2' },
      command: ['sleep', '300'],
    });

    expect(env.environmentId).toBe('container-123');
    expect(env.provider).toBe('docker-cli');
    expect(env.status).toBe('ready');
    expect(env.metadata?.image).toBe('node:20-alpine');

    const runArgs = execDocker.mock.calls[0]?.[0] as string[];
    expect(runArgs[0]).toBe('run');
    expect(runArgs).toContain('-d');
    expect(runArgs).toContain('--rm');
    expect(runArgs).toContain('--network');
    expect(runArgs).toContain('kb-net');
    expect(runArgs).toContain('-e');
    expect(runArgs).toContain('A=1');
    expect(runArgs).toContain('B=2');
    expect(runArgs).toContain('-v');
    expect(runArgs).toContain('/repo:/workspace');
    expect(runArgs).toContain('-w');
    expect(runArgs).toContain('/workspace');
    expect(runArgs).toContain('node:20-alpine');
    expect(runArgs.slice(-2)).toEqual(['sleep', '300']);
  });

  it('maps docker running state to ready', async () => {
    const execDocker = vi.fn(async (args: string[]) => {
      if (args[0] === 'inspect') {
        return 'running\n';
      }
      throw new Error(`Unexpected command: ${args.join(' ')}`);
    });

    const adapter = new DockerEnvironmentAdapter({ execDocker });
    const status = await adapter.getStatus('env-1');

    expect(status.environmentId).toBe('env-1');
    expect(status.status).toBe('ready');
    expect(status.reason).toBe('running');
  });

  it('uses runtimeCommand when request command is omitted', async () => {
    const execDocker = vi.fn(async (args: string[]) => {
      if (args[0] === 'run') {
        return 'container-keepalive\n';
      }
      throw new Error(`Unexpected command: ${args.join(' ')}`);
    });

    const adapter = new DockerEnvironmentAdapter({
      execDocker,
      runtimeCommand: ['node', '/app/dist/cli.cjs'],
    });
    await adapter.create({ runId: 'keepalive' });

    const runArgs = execDocker.mock.calls[0]?.[0] as string[];
    expect(runArgs.slice(-2)).toEqual(['node', '/app/dist/cli.cjs']);
  });

  it('uses image default when no command and no runtimeCommand', async () => {
    const execDocker = vi.fn(async (args: string[]) => {
      if (args[0] === 'run') {
        return 'container-default\n';
      }
      throw new Error(`Unexpected command: ${args.join(' ')}`);
    });

    const adapter = new DockerEnvironmentAdapter({ execDocker });
    await adapter.create({ runId: 'keepalive' });

    const runArgs = execDocker.mock.calls[0]?.[0] as string[];
    // Last arg is the image, no command appended
    expect(runArgs[runArgs.length - 1]).toBe('node:20-alpine');
  });

  it('returns terminated for missing containers on status', async () => {
    const execDocker = vi.fn(async () => {
      throw new Error('Error response from daemon: No such container: env-missing');
    });

    const adapter = new DockerEnvironmentAdapter({ execDocker });
    const status = await adapter.getStatus('env-missing');

    expect(status.status).toBe('terminated');
    expect(status.reason).toBe('container_not_found');
  });

  it('destroy is idempotent for missing containers', async () => {
    const execDocker = vi.fn(async () => {
      throw new Error('No such container: env-missing');
    });

    const adapter = new DockerEnvironmentAdapter({ execDocker });
    await expect(adapter.destroy('env-missing')).resolves.toBeUndefined();
  });

  it('renews lease with requested ttl', async () => {
    const adapter = new DockerEnvironmentAdapter();
    const ttlMs = 45_000;
    const lease = await adapter.renewLease('env-1', ttlMs);

    const expiresAt = new Date(lease.expiresAt).getTime();
    const acquiredAt = new Date(lease.acquiredAt).getTime();
    expect(expiresAt - acquiredAt).toBe(ttlMs);
  });

  it('returns provider capabilities', () => {
    const adapter = new DockerEnvironmentAdapter();
    const capabilities = adapter.getCapabilities();

    expect(capabilities.supportsLeaseRenewal).toBe(true);
    expect(capabilities.supportsSnapshots).toBe(false);
    expect(capabilities.custom?.provider).toBe('docker-cli');
  });
});
