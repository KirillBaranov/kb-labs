/**
 * @module cli-core/gateway/transport-resolver
 *
 * Determines which transport to use for CLI → Gateway communication.
 * Priority: Host Agent IPC → Direct Gateway HTTP.
 * If nothing available — throws (no offline mode).
 */

import * as path from 'node:path';
import * as os from 'node:os';
import * as net from 'node:net';
import type { IGatewayClient } from './types.js';
import { CredentialsManager } from './credentials.js';
import { HttpSseGatewayTransport } from './http-sse-transport.js';
import { HostAgentTransport } from './host-agent-transport.js';

/** Default Host Agent IPC socket path */
const HOST_AGENT_SOCKET = path.join(os.homedir(), '.kb', 'agent.sock');

/**
 * Resolve the best available transport for CLI → Gateway communication.
 *
 * Priority:
 * 1. Host Agent IPC socket (same host, low latency)
 * 2. Direct Gateway HTTP (remote, needs credentials)
 * 3. Error — no offline mode
 */
export async function resolveTransport(): Promise<IGatewayClient> {
  // 1. Check if Host Agent IPC socket is alive
  if (await isSocketAlive(HOST_AGENT_SOCKET)) {
    return new HostAgentTransport(HOST_AGENT_SOCKET);
  }

  // 2. Check if Gateway credentials exist
  const credentialsManager = new CredentialsManager();
  const credentials = await credentialsManager.load();
  if (credentials) {
    return new HttpSseGatewayTransport(
      { gatewayUrl: credentials.gatewayUrl },
      credentialsManager,
    );
  }

  // 3. No offline mode — error
  throw new Error(
    'Gateway unavailable. Run "kb auth login" to configure Gateway connection.',
  );
}

/**
 * Check if a Unix socket is alive (accepts connections).
 */
async function isSocketAlive(socketPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const client = net.createConnection({ path: socketPath }, () => {
      client.destroy();
      resolve(true);
    });
    client.on('error', () => {
      resolve(false);
    });
    // Timeout after 500ms
    client.setTimeout(500, () => {
      client.destroy();
      resolve(false);
    });
  });
}
