/**
 * Regression test: Worker.execute()'s execution-timeout path used to just
 * abandon the pending promise — delete it from pendingRequests, mark the
 * worker 'idle' again, and reject with a bare `Error("... timed out after
 * Xms")` carrying no code/details/output. Two bugs followed:
 *
 *   1. The runaway child process was never killed — it kept running in the
 *      background while the pool believed the worker was free again.
 *   2. Because the pending-request bookkeeping was torn down immediately,
 *      any later IPC message from the orphaned child (including whatever
 *      output it had produced) was silently dropped.
 *
 * This is a REAL fork()'d child process test (not mocked): a fixture worker
 * script (hanging-worker-script.mjs) stands in for the production
 * worker-script.ts — same IPC contract, but its handler deliberately never
 * responds — so the timeout has to fire against a genuinely running OS
 * process, the same as it would in production.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Worker } from '../backends/worker-pool/worker.js';
import type { ExecutionRequest } from '../types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HANGING_SCRIPT = path.join(__dirname, 'fixtures', 'hanging-worker-script.mjs');

function makeRequest(overrides: Partial<ExecutionRequest> = {}): ExecutionRequest {
  return {
    executionId: `exec-${Math.random().toString(36).slice(2)}`,
    handlerRef: './dist/handler.js',
    pluginRoot: '/tmp/plugin',
    input: {},
    descriptor: {
      hostType: 'cli',
      pluginId: '@kb-labs/release-manager-cli',
      handlerId: 'checks',
    } as unknown as ExecutionRequest['descriptor'],
    ...overrides,
  };
}

describe('Worker — execution timeout (real forked child process)', () => {
  let worker: Worker | undefined;

  afterEach(() => {
    // Best-effort: most tests kill the worker themselves as part of the
    // assertion, but don't leak a process if an assertion throws first.
    worker?.kill();
    worker = undefined;
  });

  it('kills the runaway child process instead of leaving it running', async () => {
    worker = new Worker({ workerScript: HANGING_SCRIPT });
    await worker.spawn();
    const pid = worker.info.pid!;
    expect(pid).toBeGreaterThan(0);

    await expect(
      worker.execute(makeRequest(), 300),
    ).rejects.toThrow(/timed out/i);

    // The whole point of the fix: the OS process backing this worker must
    // actually be gone, not just abandoned. process.kill(pid, 0) throws
    // ESRCH once the process no longer exists.
    await new Promise<void>((resolve) => { setTimeout(resolve, 100); });
    expect(() => process.kill(pid, 0)).toThrow();
  });

  it('rejects with a rich TimeoutError — code, worker/plugin/handler identity, and last output — not a bare message', async () => {
    worker = new Worker({ workerScript: HANGING_SCRIPT });
    await worker.spawn();

    let caught: unknown;
    try {
      await worker.execute(makeRequest({ handlerRef: './dist/checks.js' }), 300);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    const error = caught as Error & { code?: string; details?: Record<string, unknown> };
    expect(error.code).toBe('TIMEOUT');
    expect(error.details).toMatchObject({
      timeoutMs: 300,
      handlerRef: './dist/checks.js',
      pluginId: '@kb-labs/release-manager-cli',
    });
    expect(error.details?.workerId).toBeTruthy();
    // The fixture script sends one 'log' line before hanging — proof that
    // whatever the runaway process reported before the kill survives into
    // the rejected error, not just into a log call nobody reads.
    expect(error.message).toContain('installing package 7 of 40');
    expect(
      (error.details?.lastActivity as { message?: string } | undefined)?.message,
    ).toContain('installing package 7 of 40');
  });

  it('marks the worker stopped/unhealthy after a timeout kill, not idle/reusable', async () => {
    worker = new Worker({ workerScript: HANGING_SCRIPT });
    await worker.spawn();

    await worker.execute(makeRequest(), 300).catch(() => {});

    // Before the fix this was 'idle' with healthy:true — the pool would
    // have handed a NEW request to a worker whose old handler was still
    // running in the (never-killed) background process.
    expect(worker.state).toBe('stopped');
    expect(worker.info.healthy).toBe(false);
    expect(worker.isAvailable).toBe(false);
  });
});
