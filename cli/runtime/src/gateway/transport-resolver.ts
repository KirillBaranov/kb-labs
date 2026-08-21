/**
 * @module cli-core/gateway/transport-resolver
 *
 * Determines which transport to use for CLI → Gateway communication.
 *
 * Priority:
 *   1. Host Agent IPC socket (~/.kb/agent.sock) — for workspace agent / same-host deployment
 *   2. KB_GATEWAY_URL env var — explicit execution gateway (CI/CD, remote platform)
 *   3. null — no gateway configured; caller falls back to local execution
 *
 * NOTE: credentials.json is intentionally NOT used for execution routing.
 * It is a registry/identity credential file (tokens, handle) — not platform topology config.
 * The execution gateway URL must be provided explicitly via KB_GATEWAY_URL or IPC socket.
 * Auth tokens for the HTTP transport are still loaded from credentials.json when available.
 */

import * as path from 'node:path';
import * as os from 'node:os';
import * as net from 'node:net';
import type { IGatewayClient } from './types.js';
import { CredentialsManager } from './credentials.js';
import { HttpSseGatewayTransport } from './http-sse-transport.js';
import { HostAgentTransport } from './host-agent-transport.js';
import { hasLocalRuntimeState, resolveLocalGatewayUrl } from './net-offset.js';

/** Default Host Agent IPC socket path */
const HOST_AGENT_SOCKET = path.join(os.homedir(), '.kb', 'agent.sock');

/**
 * Resolve the best available transport for CLI → Gateway communication.
 * Returns null when no gateway is configured — callers fall back to local execution.
 */
export async function resolveTransport(): Promise<IGatewayClient | null> {
  // 1. Host Agent IPC socket (same-host deployment, workspace agent)
  if (await isSocketAlive(HOST_AGENT_SOCKET)) {
    return new HostAgentTransport(HOST_AGENT_SOCKET);
  }

  // 2. Explicit execution gateway via KB_GATEWAY_URL
  const gatewayUrl = process.env['KB_GATEWAY_URL'];
  if (gatewayUrl) {
    // Auth tokens from credentials.json if available (non-fatal if absent)
    const credentialsManager = new CredentialsManager();
    return new HttpSseGatewayTransport({ gatewayUrl }, credentialsManager);
  }

  // 3. Local kb-dev gateway. The project-local offset state keeps this in
  // sync with `kb-dev --net-offset` without endpoint flags.
  return hasLocalRuntimeState()
    ? new HttpSseGatewayTransport({ gatewayUrl: resolveLocalGatewayUrl() }, new CredentialsManager())
    : null;
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
