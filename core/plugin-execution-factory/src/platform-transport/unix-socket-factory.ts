/**
 * Unix socket platform transport factory.
 *
 * Replaces the IPC (process.send) default with a Unix domain socket.
 * Avoids the 16 KB IPC buffer limit that causes "persistent backpressure"
 * errors when large LLM responses are returned to worker processes.
 *
 * Architecture:
 *   - One UnixSocketServer created per backend instance (NOT per worker).
 *   - All workers in the pool share the same server socket.
 *   - Socket path is unique per backend instance:
 *       /tmp/kb-pool-{pid}-{randomId}.sock
 *   - Workers receive KB_PLATFORM_SOCKET_PATH via getChildEnv().
 *   - Workers set KB_PLATFORM_TRANSPORT=unix-socket, which triggers
 *     UnixSocketTransport creation in worker-script.ts.
 *
 * Why one server per pool (not per worker)?
 *   Unix sockets handle multiple concurrent clients naturally — the server
 *   accepts connections from all workers and dispatches calls independently.
 *   Creating a separate socket per worker would require a socket lifecycle
 *   coupled to the worker lifecycle, which adds complexity with no benefit.
 *
 * Why not IPC?
 *   Node.js IPC (process.send) serialises messages through a pipe with a
 *   fixed kernel buffer (~16 KB). When the parent sends a large payload
 *   (e.g., LLM response with long context), the buffer fills and
 *   process.send() returns false. The ChildIPCServer retries up to 20
 *   times with exponential back-off (50 ms … 5 s). If the child is blocked
 *   waiting for the response it cannot drain the buffer → deadlock →
 *   "Failed to send IPC message after 20 retries: persistent backpressure".
 *   Unix sockets have no such buffer cap.
 */

import { randomBytes } from 'node:crypto';
import type { ChildProcess } from 'node:child_process';
import type { PlatformServices } from '@kb-labs/plugin-contracts';
import { UnixSocketServer, createSocketPath } from '@kb-labs/core-ipc';
import type { PlatformTransportFactory, PlatformTransportServer } from '../types.js';

/**
 * Unix socket platform transport factory.
 *
 * Create one instance per WorkerPoolBackend. Call `init()` once before
 * spawning workers, `dispose()` on shutdown.
 */
export class UnixSocketPlatformTransportFactory implements PlatformTransportFactory {
  readonly type = 'unix-socket';

  private server: UnixSocketServer | null = null;
  private readonly socketPath: string;

  constructor() {
    // Unique per-instance path: combines PID + 4 random bytes → no collision
    // even when multiple backend instances run in the same process (e.g. tests).
    const id = `pool-${process.pid}-${randomBytes(4).toString('hex')}`;
    this.socketPath = createSocketPath(id);
  }

  /**
   * Start the shared Unix socket server.
   * Must be called once before the first worker is spawned.
   */
  async init(platform: PlatformServices): Promise<void> {
    if (this.server) {
      return; // Already started
    }
    this.server = new UnixSocketServer(platform as any, { socketPath: this.socketPath });
    await this.server.start();
  }

  /**
   * Stop the shared server and remove the socket file.
   * Should be called when the backend shuts down.
   */
  async dispose(): Promise<void> {
    if (this.server) {
      await this.server.close();
      this.server = null;
    }
  }

  /**
   * Pass the socket path to each worker process via env.
   * worker-script.ts reads KB_PLATFORM_SOCKET_PATH when
   * KB_PLATFORM_TRANSPORT === 'unix-socket'.
   */
  getChildEnv(): Record<string, string> {
    return {
      KB_PLATFORM_SOCKET_PATH: this.socketPath,
    };
  }

  /**
   * No per-worker server needed — all workers share the single socket server
   * started in init(). Returns a noop PlatformTransportServer.
   */
  createServer(
    _platform: PlatformServices,
    _child: ChildProcess,
  ): PlatformTransportServer {
    // The real server is managed by init()/dispose(), not per-worker.
    return {
      start: () => {},
      stop: () => {},
    };
  }
}
