import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import type {
  EnsureOptions,
  KbDevControllerOptions,
  KbDevResult,
  ServiceId,
  ServiceStatus,
  StatusSnapshot,
} from './types.js';
import { resolveWorkspaceRoot } from './workspace-root.js';

/**
 * Ring buffer for the last N lines of subprocess output.
 * Used so that on failure the harness can dump recent kb-dev noise
 * into the test output without swamping it with tens of thousands of lines.
 */
class RingBuffer {
  private buf: string[] = [];
  constructor(private readonly capacity: number) {}
  push(line: string): void {
    this.buf.push(line);
    if (this.buf.length > this.capacity) {
      this.buf.splice(0, this.buf.length - this.capacity);
    }
  }
  snapshot(): string[] {
    return [...this.buf];
  }
}

interface SubprocessResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Controller that drives kb-dev as a subprocess and exposes its JSON
 * agent protocol as a typed TypeScript API for e2e tests.
 *
 * Lifecycle: one controller per test file (beforeAll/afterAll).
 * Services booted through this controller are shared across every
 * `describe`/`it` in that file.
 */
export class KbDevController {
  readonly projectRoot: string;
  readonly kbDevBin: string;
  private readonly env: Record<string, string>;
  private readonly logSink?: (line: string) => void;
  private readonly ring = new RingBuffer(400);
  /** Services this controller started (and therefore should clean up). */
  private readonly startedByUs = new Set<ServiceId>();
  /** Cached last status snapshot (invalidated on any mutating call). */
  private lastStatus?: StatusSnapshot;

  constructor(opts: KbDevControllerOptions = {}) {
    this.projectRoot = opts.projectRoot ?? resolveWorkspaceRoot();
    this.kbDevBin = opts.kbDevBin ?? resolve(this.projectRoot, 'tools/kb-dev/kb-dev');
    if (!existsSync(this.kbDevBin)) {
      throw new Error(
        `kb-dev binary not found at ${this.kbDevBin}. ` +
          'Build it with: cd tools/kb-dev && make build',
      );
    }
    this.env = {
      ...process.env as Record<string, string>,
      ...(opts.env ?? {}),
      KB_PROJECT_ROOT: this.projectRoot,
    };
    this.logSink = opts.logSink;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Ensure every listed service is `alive`. Idempotent — if a service is
   * already running, kb-dev reports `skipped` and we don't respawn.
   *
   * Throws with a formatted hint + recent log tail on failure.
   */
  async ensureServices(
    ids: ServiceId[],
    opts: EnsureOptions = {},
  ): Promise<StatusSnapshot> {
    const timeoutMs = opts.timeoutMs ?? 60_000;
    const args = ['ensure', ...ids, '--json'];
    if (opts.force) {args.push('--force');}

    const result = await this.runJson<KbDevResult>(args, timeoutMs);
    if (!result.ok) {
      throw this.formatError(`kb-dev ensure ${ids.join(' ')}`, result);
    }
    for (const action of result.actions ?? []) {
      if (action.action === 'started') {
        this.startedByUs.add(action.service as ServiceId);
      }
    }
    // Poll status until every requested service is alive (ensure returns
    // when spawn completes, but health may still be warming up).
    const snapshot = await this.waitUntilAlive(ids, timeoutMs);
    this.lastStatus = snapshot;
    return snapshot;
  }

  /**
   * Block until a single service reports `alive` or the timeout expires.
   */
  async ready(id: ServiceId, timeoutMs = 60_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const snap = await this.status();
      const svc = snap.services[id];
      if (svc?.state === 'alive') {return;}
      if (svc?.state === 'failed') {
        throw new Error(
          `Service ${id} entered 'failed' state.\n` +
            `Logs tail:\n${(svc.logsTail ?? []).join('\n')}`,
        );
      }
      await sleep(500);
    }
    throw new Error(`Timeout waiting for ${id} to become alive (${timeoutMs}ms)`);
  }

  /** Query current status for all services. */
  async status(): Promise<StatusSnapshot> {
    const result = await this.runJson<StatusSnapshot>(['status', '--json'], 10_000);
    this.lastStatus = result;
    return result;
  }

  /**
   * Stop the given services (or everything this controller started, if none given).
   * Always best-effort — errors are logged but never thrown.
   */
  async stopServices(ids?: ServiceId[]): Promise<void> {
    const toStop = ids ?? Array.from(this.startedByUs);
    if (toStop.length === 0) {return;}
    try {
      await this.runJson<KbDevResult>(['stop', ...toStop, '--json'], 30_000);
    } catch (err) {
      // Stop failures should never mask the real test failure.
      this.logSink?.(`[kb-dev] stop failed (ignored): ${(err as Error).message}`);
    }
    for (const id of toStop) {this.startedByUs.delete(id);}
    this.lastStatus = undefined;
  }

  /** Disposes the controller — stops every service it started. */
  async dispose(): Promise<void> {
    await this.stopServices();
  }

  /**
   * Return the HTTP base URL for a service, e.g. `http://localhost:4000`.
   * Throws if the service is not in the last known status snapshot or has no URL.
   */
  getServiceUrl(id: ServiceId): string {
    const svc = this.requireService(id);
    if (!svc.url) {
      throw new Error(`Service ${id} has no URL in its status (state=${svc.state})`);
    }
    return svc.url;
  }

  /** Return the port for a service, or throw if unknown. */
  getServicePort(id: ServiceId): number {
    const svc = this.requireService(id);
    if (!svc.port) {
      throw new Error(`Service ${id} has no port in its status (state=${svc.state})`);
    }
    return svc.port;
  }

  /** Snapshot of recent subprocess log lines, newest last. */
  dumpRecentLogs(): string[] {
    return this.ring.snapshot();
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private requireService(id: ServiceId): ServiceStatus {
    if (!this.lastStatus) {
      throw new Error(
        `No status snapshot yet for ${id}. Call ensureServices() or status() first.`,
      );
    }
    const svc = this.lastStatus.services[id];
    if (!svc) {
      throw new Error(`Service ${id} not found in status snapshot`);
    }
    return svc;
  }

  private async waitUntilAlive(
    ids: ServiceId[],
    timeoutMs: number,
  ): Promise<StatusSnapshot> {
    const deadline = Date.now() + timeoutMs;
    let lastSnap: StatusSnapshot | undefined;
    while (Date.now() < deadline) {
      lastSnap = await this.status();
      const allAlive = ids.every((id) => lastSnap?.services[id]?.state === 'alive');
      if (allAlive) {return lastSnap;}
      // Fail fast on hard failures — no point waiting for a service already marked `failed`.
      const failed = ids.find((id) => lastSnap?.services[id]?.state === 'failed');
      if (failed) {
        const svc = lastSnap!.services[failed]!;
        throw new Error(
          `Service ${failed} failed during ensure.\n` +
            `Logs tail:\n${(svc.logsTail ?? []).join('\n')}`,
        );
      }
      await sleep(500);
    }
    throw new Error(
      `Timeout waiting for services to become alive: ${ids.join(', ')}.\n` +
        `Last known states: ${ids
          .map((id) => `${id}=${lastSnap?.services[id]?.state ?? 'unknown'}`)
          .join(', ')}`,
    );
  }

  private formatError(prefix: string, result: KbDevResult): Error {
    const lines: string[] = [`${prefix} failed`];
    if (result.hint) {lines.push(`Hint: ${result.hint}`);}
    for (const action of result.actions ?? []) {
      if (action.action === 'failed' || action.error) {
        lines.push(`  - ${action.service}: ${action.error ?? 'failed'}`);
        for (const log of action.logsTail ?? []) {
          lines.push(`      ${log}`);
        }
      }
    }
    const recent = this.ring.snapshot();
    if (recent.length > 0) {
      lines.push('Recent kb-dev output:');
      for (const l of recent.slice(-40)) {lines.push(`  ${l}`);}
    }
    return new Error(lines.join('\n'));
  }

  /**
   * Run a kb-dev subcommand and parse the stdout as JSON.
   * kb-dev prints only the JSON object on stdout when `--json` is set;
   * any logs go to stderr.
   */
  private async runJson<T>(args: string[], timeoutMs: number): Promise<T> {
    const result = await this.run(args, timeoutMs);
    if (result.code !== 0 && !result.stdout.trim()) {
      throw new Error(
        `kb-dev ${args.join(' ')} exited with code ${result.code}\n` +
          `stderr:\n${result.stderr}`,
      );
    }
    try {
      return JSON.parse(result.stdout) as T;
    } catch (err) {
      throw new Error(
        `Failed to parse JSON from \`kb-dev ${args.join(' ')}\`:\n` +
          `  error: ${(err as Error).message}\n` +
          `  stdout: ${result.stdout.slice(0, 2000)}\n` +
          `  stderr: ${result.stderr.slice(0, 2000)}`,
      );
    }
  }

  private run(args: string[], timeoutMs: number): Promise<SubprocessResult> {
    return new Promise((resolvePromise) => {
      const child = spawn(this.kbDevBin, args, {
        cwd: this.projectRoot,
        env: this.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      const onLine = (chunk: Buffer, stream: 'stdout' | 'stderr') => {
        const text = chunk.toString();
        if (stream === 'stdout') {stdout += text;}
        else {stderr += text;}
        for (const line of text.split('\n')) {
          if (line) {
            this.ring.push(`[${stream}] ${line}`);
            this.logSink?.(`[kb-dev ${args[0]}] [${stream}] ${line}`);
          }
        }
      };

      child.stdout.on('data', (d: Buffer) => onLine(d, 'stdout'));
      child.stderr.on('data', (d: Buffer) => onLine(d, 'stderr'));

      const timer = setTimeout(() => {
        child.kill('SIGKILL');
      }, timeoutMs);

      child.on('close', (code) => {
        clearTimeout(timer);
        resolvePromise({ code: code ?? -1, stdout, stderr });
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        resolvePromise({ code: -1, stdout, stderr: stderr + '\n' + err.message });
      });
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => { setTimeout(r, ms); });
}
