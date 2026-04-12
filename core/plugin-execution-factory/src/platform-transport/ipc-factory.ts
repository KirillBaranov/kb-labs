/**
 * Default IPC platform transport factory.
 *
 * Uses Node.js fork IPC channel (process.send/on('message')) for platform adapter calls.
 * Server side: ChildIPCServer listens on child.on('message')
 * Client side: IPCTransport sends via process.send() (created by worker-script)
 */

import type { ChildProcess } from 'node:child_process';
import type { PlatformServices } from '@kb-labs/plugin-contracts';
import { ChildIPCServer } from '@kb-labs/core-ipc';
import type { PlatformTransportFactory, PlatformTransportServer } from '../types.js';

/**
 * IPC platform transport factory.
 *
 * Default transport for worker-pool mode.
 * Uses the existing IPC channel created by child_process.fork().
 * No extra configuration needed — just works.
 */
export class IPCPlatformTransportFactory implements PlatformTransportFactory {
  readonly type = 'ipc';

  createServer(
    platform: PlatformServices,
    child: ChildProcess,
  ): PlatformTransportServer {
    const server = new ChildIPCServer(platform as any, child);
    return {
      start: () => server.start(),
      stop: () => server.stop(),
    };
  }
}
