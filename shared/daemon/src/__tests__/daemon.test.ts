import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import type { PlatformContainer } from '@kb-labs/core-runtime';
import { runDaemon, type DaemonConfig } from '../index.js';

function makePlatform(): PlatformContainer {
  return {
    logger: {
      trace: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
      child: vi.fn().mockImplementation(() => makePlatform().logger),
    },
    shutdown: vi.fn().mockResolvedValue(undefined),
  } as unknown as PlatformContainer;
}

function makePlatformBootstrap(platform?: PlatformContainer) {
  const p = platform ?? makePlatform();
  return {
    platform: p,
    bootstrap: vi.fn().mockResolvedValue(p),
  };
}

function makeConfig(overrides?: Partial<DaemonConfig>): DaemonConfig {
  return {
    appId: 'test-daemon',
    defaultPort: 9999,
    portEnvVar: 'TEST_PORT',
    defaultHost: '127.0.0.1',
    hostEnvVar: 'TEST_HOST',
    setup: vi.fn().mockResolvedValue(vi.fn().mockResolvedValue(undefined)),
    ...overrides,
  };
}

describe('runDaemon()', () => {
  const origEnv = { ...process.env };
  const signalListeners: Array<{ event: string; fn: (...args: unknown[]) => unknown }> = [];
  const realProcessOn = process.on.bind(process);

  beforeEach(() => {
    // Capture signal handlers so we can trigger them in tests
    vi.spyOn(process, 'on').mockImplementation((event: string | symbol, fn: (...args: unknown[]) => unknown) => {
      if (event === 'SIGTERM' || event === 'SIGINT') {
        signalListeners.push({ event: String(event), fn });
      } else {
        realProcessOn(event as NodeJS.Signals, fn as NodeJS.SignalsListener);
      }
      return process;
    });
  });

  afterEach(() => {
    process.env = { ...origEnv };
    signalListeners.length = 0;
    vi.restoreAllMocks();
  });

  it('calls platformBootstrap with appId', async () => {
    const { bootstrap } = makePlatformBootstrap();
    const config = makeConfig();
    await runDaemon(config, bootstrap);
    expect(bootstrap).toHaveBeenCalledWith('test-daemon', expect.any(String));
  });

  it('calls platformBootstrap with a repoRoot path (string)', async () => {
    const { bootstrap } = makePlatformBootstrap();
    await runDaemon(makeConfig(), bootstrap);
    const [, repoRoot] = bootstrap.mock.calls[0] as [string, string];
    expect(typeof repoRoot).toBe('string');
    expect(repoRoot.length).toBeGreaterThan(0);
  });

  it('reads port from portEnvVar env var', async () => {
    process.env.TEST_PORT = '1234';
    const { bootstrap, platform } = makePlatformBootstrap();
    const setup = vi.fn().mockResolvedValue(vi.fn().mockResolvedValue(undefined));
    await runDaemon(makeConfig({ setup }), bootstrap);
    const ctx = (setup.mock.calls[0] as [{ port: number }])[0];
    expect(ctx.port).toBe(1234);
  });

  it('falls back to defaultPort when portEnvVar is not set', async () => {
    delete process.env.TEST_PORT;
    const { bootstrap } = makePlatformBootstrap();
    const setup = vi.fn().mockResolvedValue(vi.fn().mockResolvedValue(undefined));
    await runDaemon(makeConfig({ setup }), bootstrap);
    const ctx = (setup.mock.calls[0] as [{ port: number }])[0];
    expect(ctx.port).toBe(9999);
  });

  it('reads host from hostEnvVar env var', async () => {
    process.env.TEST_HOST = '0.0.0.0';
    const { bootstrap } = makePlatformBootstrap();
    const setup = vi.fn().mockResolvedValue(vi.fn().mockResolvedValue(undefined));
    await runDaemon(makeConfig({ setup }), bootstrap);
    const ctx = (setup.mock.calls[0] as [{ host: string }])[0];
    expect(ctx.host).toBe('0.0.0.0');
  });

  it('falls back to defaultHost when hostEnvVar is not set', async () => {
    delete process.env.TEST_HOST;
    const { bootstrap } = makePlatformBootstrap();
    const setup = vi.fn().mockResolvedValue(vi.fn().mockResolvedValue(undefined));
    await runDaemon(makeConfig({ setup }), bootstrap);
    const ctx = (setup.mock.calls[0] as [{ host: string }])[0];
    expect(ctx.host).toBe('127.0.0.1');
  });

  it('calls setup with platform and logger', async () => {
    const { bootstrap, platform } = makePlatformBootstrap();
    const setup = vi.fn().mockResolvedValue(vi.fn().mockResolvedValue(undefined));
    await runDaemon(makeConfig({ setup }), bootstrap);
    const ctx = (setup.mock.calls[0] as [{ platform: PlatformContainer; logger: unknown }])[0];
    expect(ctx.platform).toBe(platform);
    expect(ctx.logger).toBeTruthy();
  });

  it('on SIGTERM: calls teardown() before platform.shutdown()', async () => {
    const callOrder: string[] = [];
    const teardown = vi.fn().mockImplementation(async () => { callOrder.push('teardown'); });
    const platform = makePlatform();
    (platform.shutdown as ReturnType<typeof vi.fn>).mockImplementation(async () => { callOrder.push('shutdown'); });
    const { bootstrap } = makePlatformBootstrap(platform);
    const setup = vi.fn().mockResolvedValue(teardown);

    await runDaemon(makeConfig({ setup }), bootstrap);

    const sigtermHandler = signalListeners.find((l) => l.event === 'SIGTERM');
    expect(sigtermHandler).toBeTruthy();

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    await (sigtermHandler!.fn as () => Promise<void>)();

    expect(callOrder).toEqual(['teardown', 'shutdown']);
    exitSpy.mockRestore();
  });

  it('on SIGTERM: calls process.exit(0) after shutdown', async () => {
    const { bootstrap } = makePlatformBootstrap();
    await runDaemon(makeConfig(), bootstrap);

    const sigtermHandler = signalListeners.find((l) => l.event === 'SIGTERM');
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    await (sigtermHandler!.fn as () => Promise<void>)();

    expect(exitSpy).toHaveBeenCalledWith(0);
    exitSpy.mockRestore();
  });

  it('on SIGINT: same teardown → shutdown order', async () => {
    const callOrder: string[] = [];
    const teardown = vi.fn().mockImplementation(async () => { callOrder.push('teardown'); });
    const platform = makePlatform();
    (platform.shutdown as ReturnType<typeof vi.fn>).mockImplementation(async () => { callOrder.push('shutdown'); });
    const { bootstrap } = makePlatformBootstrap(platform);
    const setup = vi.fn().mockResolvedValue(teardown);

    await runDaemon(makeConfig({ setup }), bootstrap);

    const sigintHandler = signalListeners.find((l) => l.event === 'SIGINT');
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    await (sigintHandler!.fn as () => Promise<void>)();

    expect(callOrder).toEqual(['teardown', 'shutdown']);
    exitSpy.mockRestore();
  });

  it('on repeated signals: runs teardown only once', async () => {
    const teardown = vi.fn().mockResolvedValue(undefined);
    const { bootstrap } = makePlatformBootstrap();
    await runDaemon(makeConfig({ setup: vi.fn().mockResolvedValue(teardown) }), bootstrap);

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const sigterm = signalListeners.find((l) => l.event === 'SIGTERM')!;
    const sigint = signalListeners.find((l) => l.event === 'SIGINT')!;
    await (sigterm.fn as () => Promise<void>)();
    await (sigint.fn as () => Promise<void>)();

    expect(teardown).toHaveBeenCalledTimes(1);
    exitSpy.mockRestore();
  });

  it('passes repoRoot to setup', async () => {
    const { bootstrap } = makePlatformBootstrap();
    const setup = vi.fn().mockResolvedValue(vi.fn().mockResolvedValue(undefined));
    await runDaemon(makeConfig({ setup }), bootstrap);
    const ctx = (setup.mock.calls[0] as [{ repoRoot: string }])[0];
    expect(typeof ctx.repoRoot).toBe('string');
    expect(ctx.repoRoot.length).toBeGreaterThan(0);
  });

  it('propagates error thrown in setup()', async () => {
    const { bootstrap } = makePlatformBootstrap();
    const config = makeConfig({
      setup: vi.fn().mockRejectedValue(new Error('setup failed')),
    });
    await expect(runDaemon(config, bootstrap)).rejects.toThrow('setup failed');
  });

  it('sets KB_SOCKET_HASH in process.env before platformBootstrap is called', async () => {
    delete process.env.KB_SOCKET_HASH;
    let hashAtBootstrap: string | undefined;
    const bootstrap = vi.fn().mockImplementation(async () => {
      hashAtBootstrap = process.env.KB_SOCKET_HASH;
      return makePlatform();
    });
    await runDaemon(makeConfig(), bootstrap);
    expect(hashAtBootstrap).toBeTruthy();
    expect(hashAtBootstrap).toMatch(/^[0-9a-f]{8}$/);
  });

  it('does not override KB_SOCKET_HASH if already set by kb-dev', async () => {
    process.env.KB_SOCKET_HASH = 'preset12';
    let hashAtBootstrap: string | undefined;
    const bootstrap = vi.fn().mockImplementation(async () => {
      hashAtBootstrap = process.env.KB_SOCKET_HASH;
      return makePlatform();
    });
    await runDaemon(makeConfig(), bootstrap);
    expect(hashAtBootstrap).toBe('preset12');
  });
});
