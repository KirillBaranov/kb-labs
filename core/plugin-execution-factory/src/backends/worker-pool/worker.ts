/**
 * @module @kb-labs/plugin-execution/backends/worker-pool/worker
 *
 * Worker class - manages a single worker subprocess.
 * Handles IPC communication, health checks, and lifecycle.
 */

import { fork, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { randomBytes } from 'node:crypto';
import type {
  WorkerState,
  WorkerInfo,
  WorkerMessage,
  ExecuteMessage,
  ResultMessage,
  ErrorMessage,
  LogWorkerMessage,
  ReadyMessage,
  MiddlewaresInitMessage,
  UIPromptMessage,
  UIPromptResultMessage,
} from './types.js';
import type { RawMiddlewareDecl } from '@kb-labs/plugin-runtime';
interface WithMiddlewareDecls {
  getAdapter(key: '_middlewareDecls'): RawMiddlewareDecl[] | undefined;
}
import type { ExecutionRequest, ExecutionResult, PlatformTransportFactory, PlatformTransportServer } from '../../types.js';
import type { PlatformServices } from '@kb-labs/plugin-contracts';
import { WorkerCrashedError, TimeoutError } from '../../errors.js';

/**
 * Worker events.
 */
export interface WorkerEvents {
  ready: [worker: Worker];
  result: [executionId: string, result: ExecutionResult];
  error: [executionId: string, error: Error];
  exit: [worker: Worker, code: number | null, signal: string | null];
  healthUpdate: [worker: Worker, healthy: boolean];
}

/**
 * Worker options.
 */
export interface WorkerOptions {
  /** Worker script path */
  workerScript: string;

  /** Platform transport factory for cross-process adapter calls */
  platformTransport?: PlatformTransportFactory;

  /** Platform services (needed by transport factory to create server) */
  platform?: PlatformServices;

  /** Timeout for worker to become ready (ms) */
  startupTimeoutMs?: number;

  /** Timeout for health check response (ms) */
  healthCheckTimeoutMs?: number;
}

const DEFAULT_STARTUP_TIMEOUT = 10_000;
const DEFAULT_HEALTH_CHECK_TIMEOUT = 5_000;

/**
 * Worker - manages a single worker subprocess.
 *
 * Lifecycle:
 * 1. spawn() - fork subprocess
 * 2. wait for 'ready' message
 * 3. execute() - send work and wait for result
 * 4. healthCheck() - verify worker is responsive
 * 5. shutdown() - graceful shutdown
 * 6. kill() - forceful termination
 */
export class Worker extends EventEmitter<WorkerEvents> {
  readonly id: string;
  private process: ChildProcess | null = null;
  private _state: WorkerState = 'stopped';
  private _info: WorkerInfo;
  private readonly options: Required<Omit<WorkerOptions, 'platform' | 'platformTransport'>> & Pick<WorkerOptions, 'platform' | 'platformTransport'>;

  // Pending request tracking
  private pendingRequests = new Map<string, {
    resolve: (result: ExecutionResult) => void;
    reject: (error: Error) => void;
    timeoutId: ReturnType<typeof setTimeout>;
    onLog?: (entry: { level: string; message: string; stream: 'stdout' | 'stderr'; lineNo: number; timestamp: string; meta?: Record<string, unknown> }) => void;
    onLoggerLog?: (entry: { level: string; message: string; stream: 'stdout' | 'stderr'; lineNo: number; timestamp: string; meta?: Record<string, unknown> }) => void;
    onUIPrompt?: (prompt: UIPromptMessage) => Promise<unknown>;
    request: ExecutionRequest;
    startedAt: number;
    /**
     * Last log/loggerLog line seen from the worker for this request, tracked
     * regardless of whether a caller supplied onLog/onLoggerLog — this is
     * what lets a timeout error say something about how far execution got
     * instead of nothing at all. See execute()'s timeout handler.
     */
    lastActivity?: { message: string; stream: 'stdout' | 'stderr'; at: number };
  }>();

  // Health check tracking
  private healthCheckPending = false;
  private healthCheckTimeout: ReturnType<typeof setTimeout> | null = null;

  // Platform transport server (forwards adapter:call from child to real adapters)
  private transportServer: PlatformTransportServer | null = null;

  constructor(options: WorkerOptions) {
    super();
    this.id = `worker_${randomBytes(4).toString('hex')}`;
    this.options = {
      workerScript: options.workerScript,
      platform: options.platform,
      platformTransport: options.platformTransport,
      startupTimeoutMs: options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT,
      healthCheckTimeoutMs: options.healthCheckTimeoutMs ?? DEFAULT_HEALTH_CHECK_TIMEOUT,
    };

    this._info = {
      id: this.id,
      state: 'stopped',
      createdAt: Date.now(),
      requestCount: 0,
      healthy: false,
    };
  }

  /**
   * Get current worker state.
   */
  get state(): WorkerState {
    return this._state;
  }

  /**
   * Get worker info.
   */
  get info(): Readonly<WorkerInfo> {
    return { ...this._info, state: this._state };
  }

  /**
   * Check if worker is available for work.
   */
  get isAvailable(): boolean {
    return this._state === 'idle' && this._info.healthy;
  }

  /**
   * Spawn worker subprocess.
   */
  async spawn(): Promise<void> {
    if (this._state !== 'stopped') {
      throw new Error(`Cannot spawn worker in state: ${this._state}`);
    }

    this._state = 'starting';
    this._info.createdAt = Date.now();

    return new Promise<void>((resolve, reject) => {
      // Timeout for startup
      const startupTimeout = setTimeout(() => {
        this.kill();
        reject(new Error(`Worker ${this.id} failed to start within ${this.options.startupTimeoutMs}ms`));
      }, this.options.startupTimeoutMs);

      try {
        // Build child env with transport type hint
        const childEnv: Record<string, string | undefined> = {
          ...process.env,
          KB_WORKER_ID: this.id,
        };
        if (this.options.platformTransport) {
          childEnv.KB_PLATFORM_TRANSPORT = this.options.platformTransport.type;
          const extraEnv = this.options.platformTransport.getChildEnv?.();
          if (extraEnv) {Object.assign(childEnv, extraEnv);}
        }

        // Fork the worker process
        this.process = fork(this.options.workerScript, [], {
          stdio: ['pipe', 'inherit', 'inherit', 'ipc'],
          env: childEnv,
        });

        this._info.pid = this.process.pid;

        // Handle messages from worker
        this.process.on('message', (message: WorkerMessage) => {
          this.handleMessage(message);
        });

        // Handle worker exit
        this.process.on('exit', (code, signal) => {
          clearTimeout(startupTimeout);
          this.handleExit(code, signal);
        });

        // Handle errors
        this.process.on('error', (error) => {
          clearTimeout(startupTimeout);
          this._state = 'stopped';
          this._info.healthy = false;
          this._info.lastError = error.message;
          reject(error);
        });

        // Start platform transport server (forwards adapter:call from child to real adapters)
        if (this.options.platformTransport && this.options.platform && this.process) {
          this.transportServer = this.options.platformTransport.createServer(
            this.options.platform,
            this.process,
          );
          this.transportServer.start();
        }

        // Wait for ready message
        const onReady = (msg: WorkerMessage) => {
          if (msg.type === 'ready') {
            clearTimeout(startupTimeout);
            this._state = 'idle';
            this._info.healthy = true;
            this._info.pid = (msg as ReadyMessage).pid;

            // Send adapter middleware declarations once after ready.
            // Worker resolves them asynchronously and caches before first execute.
            const rawDecls = this.options.platform
              ? (this.options.platform as unknown as WithMiddlewareDecls).getAdapter('_middlewareDecls') ?? []
              : [];
            if (rawDecls.length > 0 && this.process) {
              const middlewaresMsg: MiddlewaresInitMessage = { type: 'middlewares', decls: rawDecls };
              this.process.send(middlewaresMsg);
            }

            this.emit('ready', this);
            resolve();
          }
        };

        this.process.once('message', onReady);
      } catch (error) {
        clearTimeout(startupTimeout);
        this._state = 'stopped';
        reject(error);
      }
    });
  }

  /**
   * Execute a request on this worker.
   */
  async execute(
    request: ExecutionRequest,
    timeoutMs: number,
    onLog?: (entry: { level: string; message: string; stream: 'stdout' | 'stderr'; lineNo: number; timestamp: string; meta?: Record<string, unknown> }) => void,
    onUIPrompt?: (prompt: UIPromptMessage) => Promise<unknown>,
    onLoggerLog?: (entry: { level: string; message: string; stream: 'stdout' | 'stderr'; lineNo: number; timestamp: string; meta?: Record<string, unknown> }) => void,
  ): Promise<ExecutionResult> {
    if (this._state !== 'idle') {
      throw new Error(`Worker ${this.id} is not available (state: ${this._state})`);
    }

    if (!this.process) {
      throw new Error(`Worker ${this.id} has no process`);
    }

    const executionId = request.executionId;
    this._state = 'busy';
    this._info.lastRequestStartedAt = Date.now();
    this._info.currentExecutionId = executionId;

    const startedAt = Date.now();

    return new Promise<ExecutionResult>((resolve, reject) => {
      // Setup timeout.
      //
      // Regression: this used to just abandon the pending promise — delete
      // it from pendingRequests, mark the worker 'idle' again, and reject
      // with a bare `Error("Execution ... timed out after Xms")` carrying no
      // code/details. Two compounding bugs followed from that:
      //
      // 1. The underlying child process (`this.process`) was never killed.
      //    It kept running the handler in the background while the pool
      //    believed this worker was free — a later request could be
      //    dispatched onto the same still-busy process. Worker.kill() exists
      //    (SIGKILL) and is already used for the startup-timeout and
      //    shutdown-timeout paths; execution timeout was the one path that
      //    didn't call it.
      // 2. Because the pendingRequests entry was deleted immediately, any
      //    'result'/'error'/'log'/'loggerLog' IPC message the orphaned child
      //    sent afterward (including the real failure detail the fixes in
      //    checks.ts/shell.ts now preserve further down the stack) looked
      //    up an already-gone entry in handleMessage() and was silently
      //    dropped — so even output that WAS captured never reached the
      //    caller.
      //
      // Fix: actually kill the runaway process (via kill(), which also
      // clears pendingRequests/state itself), and reject with a
      // TimeoutError carrying whatever we know — worker/plugin/handler
      // identity and the last log line seen before the deadline — instead
      // of a bare, contentless message.
      const timeoutId = setTimeout(() => {
        const pending = this.pendingRequests.get(executionId);
        const timeoutError = new TimeoutError(
          `Execution ${executionId} timed out after ${timeoutMs}ms`
          + (pending?.lastActivity
            ? ` — last output ${Date.now() - pending.lastActivity.at}ms before kill: ${pending.lastActivity.message.slice(0, 500)}`
            : ' — no output was captured before the kill'),
          timeoutMs,
        );
        // TimeoutError's constructor always sets `details` to a plain object
        // ({ timeoutMs }), so this is safe to extend in place.
        Object.assign(timeoutError.details as Record<string, unknown>, {
          workerId: this.id,
          executionId,
          pluginId: request.descriptor.pluginId,
          handlerRef: request.handlerRef,
          runningForMs: Date.now() - startedAt,
          lastActivity: pending?.lastActivity,
        });
        // Reject with our richer error before kill() rejects the same
        // (already-settled-by-then) promise with a generic WorkerCrashedError
        // — a promise only honors its first settlement, and both calls are
        // synchronous here so there's no window for the pool to dispatch a
        // new request onto this worker between them.
        pending?.reject(timeoutError);
        this.kill();
      }, timeoutMs);

      // Store pending request
      this.pendingRequests.set(executionId, {
        resolve: (result) => {
          clearTimeout(timeoutId);
          this.pendingRequests.delete(executionId);
          this._state = 'idle';
          this._info.currentExecutionId = undefined;
          this._info.requestCount++;
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeoutId);
          this.pendingRequests.delete(executionId);
          this._state = 'idle';
          this._info.currentExecutionId = undefined;
          reject(error);
        },
        timeoutId,
        onLog,
        onLoggerLog,
        onUIPrompt,
        request,
        startedAt,
      });

      // Send execute message
      const message: ExecuteMessage = {
        type: 'execute',
        requestId: executionId,
        request,
        timeoutMs,
      };

      this.process!.send(message);
    });
  }

  /**
   * Perform health check.
   */
  async healthCheck(): Promise<boolean> {
    if (!this.process || this._state === 'stopped') {
      return false;
    }

    if (this.healthCheckPending) {
      return this._info.healthy;
    }

    this.healthCheckPending = true;

    return new Promise<boolean>((resolve) => {
      this.healthCheckTimeout = setTimeout(() => {
        this.healthCheckPending = false;
        this._info.healthy = false;
        this._info.lastError = 'Health check timeout';
        this._info.lastHealthCheckAt = Date.now();
        this.emit('healthUpdate', this, false);
        resolve(false);
      }, this.options.healthCheckTimeoutMs);

      const onHealth = (msg: WorkerMessage) => {
        if (msg.type === 'healthOk') {
          if (this.healthCheckTimeout) {
            clearTimeout(this.healthCheckTimeout);
            this.healthCheckTimeout = null;
          }
          this.healthCheckPending = false;
          this._info.healthy = true;
          this._info.lastHealthCheckAt = Date.now();
          this.emit('healthUpdate', this, true);
          resolve(true);
        }
      };

      this.process!.once('message', onHealth);
      this.process!.send({ type: 'health' });
    });
  }

  /**
   * Graceful shutdown.
   * Waits for current request to complete.
   */
  async shutdown(timeoutMs = 5000): Promise<void> {
    if (this._state === 'stopped') {
      return;
    }

    if (this._state === 'busy') {
      this._state = 'draining';
    }

    // Send shutdown message
    if (this.process) {
      this.process.send({ type: 'shutdown', graceful: true });
    }

    // Wait for exit with timeout
    return new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        this.kill();
        resolve();
      }, timeoutMs);

      if (this.process) {
        this.process.once('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      } else {
        clearTimeout(timeout);
        resolve();
      }
    });
  }

  /**
   * Forceful termination.
   */
  kill(): void {
    this.transportServer?.stop();
    this.transportServer = null;

    if (this.process) {
      this.process.kill('SIGKILL');
      this.process = null;
    }

    // Reject all pending requests
    for (const [_id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeoutId);
      pending.reject(new WorkerCrashedError(this.id));
    }
    this.pendingRequests.clear();

    this._state = 'stopped';
    this._info.healthy = false;
  }

  /**
   * Check if worker should be recycled.
   */
  shouldRecycle(maxRequests: number, maxUptimeMs: number): boolean {
    if (this._info.requestCount >= maxRequests) {
      return true;
    }

    const uptime = Date.now() - this._info.createdAt;
    if (uptime >= maxUptimeMs) {
      return true;
    }

    return false;
  }

  /**
   * Handle incoming message from worker process.
   */
  private handleMessage(message: WorkerMessage): void {
    switch (message.type) {
      case 'result': {
        const msg = message as ResultMessage;
        const pending = this.pendingRequests.get(msg.requestId);
        if (pending) {
          pending.resolve(msg.result);
        }
        break;
      }

      case 'error': {
        const msg = message as ErrorMessage;
        const pending = this.pendingRequests.get(msg.requestId);
        if (pending) {
          const error = new Error(msg.error.message);
          Object.assign(error, { code: msg.error.code });
          error.stack = msg.error.stack;
          pending.reject(error);
        }
        break;
      }

      case 'log': {
        const msg = message as LogWorkerMessage;
        const pending = this.pendingRequests.get(msg.requestId);
        if (pending) {
          // Tracked unconditionally (not just when a caller wired onLog) so
          // an execution-timeout error has something real to report even
          // when nothing downstream is consuming live log streaming — see
          // execute()'s timeout handler.
          pending.lastActivity = { message: msg.entry.message, stream: msg.entry.stream, at: Date.now() };
          pending.onLog?.(msg.entry);
        }
        break;
      }

      case 'loggerLog': {
        // ctx.logger.* entries — base logger already wrote to SQLite. See ADR-0019.
        const msg = message as { type: 'loggerLog'; requestId: string; entry: LogWorkerMessage['entry'] };
        const pending = this.pendingRequests.get(msg.requestId);
        if (pending) {
          pending.lastActivity = { message: msg.entry.message, stream: msg.entry.stream, at: Date.now() };
          pending.onLoggerLog?.(msg.entry);
        }
        break;
      }


      case 'uiPrompt': {
        const msg = message as UIPromptMessage;
        const pending = this.pendingRequests.get(msg.requestId);
        if (pending?.onUIPrompt && this.process) {
          const proc = this.process;
          pending.onUIPrompt(msg).then((value) => {
            const result: UIPromptResultMessage = { type: 'uiPromptResult', promptId: msg.promptId, value };
            proc.send(result);
          }).catch(() => {
            // On error, send default value (first choice or false)
            const defaultVal = msg.defaultValue ?? false;
            const result: UIPromptResultMessage = { type: 'uiPromptResult', promptId: msg.promptId, value: defaultVal };
            proc.send(result);
          });
        } else if (this.process) {
          // No handler — return default immediately
          const result: UIPromptResultMessage = { type: 'uiPromptResult', promptId: msg.promptId, value: msg.defaultValue ?? false };
          this.process.send(result);
        }
        break;
      }

      case 'healthOk': {
        // Handled in healthCheck()
        break;
      }

      case 'ready': {
        // Handled in spawn()
        break;
      }
    }
  }

  /**
   * Handle worker process exit.
   */
  private handleExit(code: number | null, signal: string | null): void {
    const wasRunning = this._state !== 'stopped';
    this._state = 'stopped';
    this._info.healthy = false;
    this.process = null;

    // Reject all pending requests
    for (const [_id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeoutId);
      pending.reject(new WorkerCrashedError(this.id, code ?? undefined, signal ?? undefined));
    }
    this.pendingRequests.clear();

    if (wasRunning) {
      this.emit('exit', this, code, signal);
    }
  }
}
