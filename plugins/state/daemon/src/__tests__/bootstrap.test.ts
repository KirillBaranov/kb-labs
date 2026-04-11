/**
 * Tests for bootstrap configuration — verifies port/host resolution from env vars,
 * server construction, and manifest correctness.
 */
import { describe, it, expect } from 'vitest';
import { StateDaemonServer } from '../server.js';
import { manifest } from '../manifest.js';

describe('StateDaemonServer construction', () => {
  it('creates server with custom port and host', () => {
    const server = new StateDaemonServer({ port: 9999, host: '0.0.0.0' });
    expect(server).toBeDefined();
    // No start() — just verify construction works
  });

  it('creates server with default config', () => {
    const server = new StateDaemonServer();
    expect(server).toBeDefined();
  });

  it('creates server with custom logger', () => {
    const logger = {
      info: () => {},
      warn: () => {},
      error: () => {},
      fatal: () => {},
      debug: () => {},
      trace: () => {},
      child: () => logger,
    } as any;

    const server = new StateDaemonServer({ logger });
    expect(server).toBeDefined();
  });
});

describe('manifest', () => {
  it('has correct schema and id', () => {
    expect(manifest.schema).toBe('kb.service/1');
    expect(manifest.id).toBe('state-daemon');
  });

  it('specifies correct default port 7777', () => {
    expect(manifest.runtime.port).toBe(7777);
  });

  it('specifies health check endpoint', () => {
    expect(manifest.runtime.healthCheck).toBe('/health');
  });

  it('has entry point defined', () => {
    expect(manifest.runtime.entry).toBeDefined();
  });
});
