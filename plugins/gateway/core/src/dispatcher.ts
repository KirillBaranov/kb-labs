/**
 * HostCallDispatcher — routes capability calls to connected Host Agents.
 *
 * Lifecycle:
 *   1. When agent connects → registerConnection(hostId, namespaceId, ws)
 *   2. When adapter needs a file → call(namespaceId, hostId, adapter, method, args)
 *      → sends { type:'call', requestId, ... } over WS
 *      → returns Promise<unknown> that resolves when chunk+result arrive
 *   3. When agent sends chunk/result/error → handleInbound(requestId, msg)
 *   4. When agent disconnects → removeConnection(hostId, namespaceId)
 */

import { randomUUID } from 'node:crypto';

/** Minimal socket interface — satisfied by @fastify/websocket WebSocket */
export interface IAgentSocket {
  send(data: string): void;
}

interface PendingCall {
  chunks: unknown[];
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const CALL_TIMEOUT_MS = 30_000;

export class HostCallDispatcher {
  /** namespaceId → hostId → socket */
  private connections = new Map<string, Map<string, IAgentSocket>>();
  /** namespaceId → capability → Set<hostId> */
  private capabilityIndex = new Map<string, Map<string, Set<string>>>();
  /** requestId → pending call */
  private pending = new Map<string, PendingCall>();

  registerConnection(hostId: string, namespaceId: string, ws: IAgentSocket, capabilities: string[] = []): void {
    if (!this.connections.has(namespaceId)) {
      this.connections.set(namespaceId, new Map());
    }
    this.connections.get(namespaceId)!.set(hostId, ws);

    // Index capabilities for routing
    if (capabilities.length > 0) {
      if (!this.capabilityIndex.has(namespaceId)) {
        this.capabilityIndex.set(namespaceId, new Map());
      }
      const nsIdx = this.capabilityIndex.get(namespaceId)!;
      for (const cap of capabilities) {
        if (!nsIdx.has(cap)) { nsIdx.set(cap, new Set()); }
        nsIdx.get(cap)!.add(hostId);
      }
    }
  }

  removeConnection(hostId: string, namespaceId: string): void {
    this.connections.get(namespaceId)?.delete(hostId);

    // Clean up capability index
    const nsIdx = this.capabilityIndex.get(namespaceId);
    if (nsIdx) {
      for (const hosts of nsIdx.values()) {
        hosts.delete(hostId);
      }
    }
  }

  /**
   * Send a capability call to a specific host and await the result.
   * Collects all chunks, resolves with the last chunk data on result.
   */
  async call(
    namespaceId: string,
    hostId: string,
    adapter: string,
    method: string,
    args: unknown[],
  ): Promise<unknown> {
    const socket = this.connections.get(namespaceId)?.get(hostId);
    if (!socket) {
      throw new Error(`Host not connected: ${hostId} (namespace: ${namespaceId})`);
    }

    const requestId = randomUUID();

    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Call timed out: ${adapter}.${method} (requestId: ${requestId})`));
      }, CALL_TIMEOUT_MS);

      this.pending.set(requestId, { chunks: [], resolve, reject, timer });

      socket.send(JSON.stringify({
        type: 'call',
        requestId,
        adapter,
        method,
        args,
        trace: { traceId: randomUUID(), spanId: randomUUID() },
      }));
    });
  }

  /** Called by ws-handler when agent sends chunk/result/error */
  handleInbound(msg: { type: string; requestId?: string; data?: unknown; error?: unknown }): void {
    const requestId = msg.requestId;
    if (!requestId) { return; }

    const pending = this.pending.get(requestId);
    if (!pending) { return; }

    if (msg.type === 'chunk') {
      pending.chunks.push(msg.data);
    } else if (msg.type === 'result') {
      clearTimeout(pending.timer);
      this.pending.delete(requestId);
      // Return last chunk data (or all chunks if multiple)
      const result = pending.chunks.length === 1
        ? pending.chunks[0]
        : pending.chunks.length > 1
          ? pending.chunks
          : undefined;
      pending.resolve(result);
    } else if (msg.type === 'error') {
      clearTimeout(pending.timer);
      this.pending.delete(requestId);
      const errMsg = typeof msg.error === 'object' && msg.error !== null
        ? String((msg.error as Record<string, unknown>)['message'] ?? msg.error)
        : String(msg.error ?? 'Unknown error');
      pending.reject(new Error(errMsg));
    }
  }

  /** How many hosts are connected in a namespace */
  connectedCount(namespaceId: string): number {
    return this.connections.get(namespaceId)?.size ?? 0;
  }

  /** Find first connected hostId in namespace (for single-agent setups) */
  firstHost(namespaceId: string): string | undefined {
    const ns = this.connections.get(namespaceId);
    if (!ns) { return undefined; }
    return ns.keys().next().value as string | undefined;
  }

  /**
   * Find first connected hostId that has a specific capability.
   * Returns undefined if no host with that capability is connected.
   *
   * TODO: Add round-robin balancing when multiple hosts with the same capability exist.
   */
  firstHostWithCapability(namespaceId: string, capability: string): string | undefined {
    const nsIdx = this.capabilityIndex.get(namespaceId);
    if (!nsIdx) { return undefined; }
    const hosts = nsIdx.get(capability);
    if (!hosts) { return undefined; }
    // Return first hostId that is still connected
    for (const hostId of hosts) {
      if (this.connections.get(namespaceId)?.has(hostId)) {
        return hostId;
      }
    }
    return undefined;
  }
}

/** Singleton dispatcher shared across all WS connections */
export const globalDispatcher = new HostCallDispatcher();
