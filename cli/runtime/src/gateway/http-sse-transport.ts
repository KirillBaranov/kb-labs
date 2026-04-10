/**
 * @module cli-core/gateway/http-sse-transport
 *
 * HTTP SSE transport for CLI Gateway client.
 * Default transport — simpler than WebSocket, sufficient for most CLI use cases.
 *
 * POST /api/v1/execute → 200 OK, Transfer-Encoding: chunked
 * Each line = JSON event (ndjson format).
 */

import type { ExecutionEvent } from '@kb-labs/core-contracts';
import type {
  IGatewayClient,
  GatewayClientConfig,
  GatewayExecuteRequest,
  GatewayCredentials,
  ICredentialsManager,
} from './types.js';

export class HttpSseGatewayTransport implements IGatewayClient {
  private readonly config: GatewayClientConfig;
  private readonly credentials: ICredentialsManager;
  private abortControllers = new Map<string, AbortController>();

  constructor(config: GatewayClientConfig, credentials: ICredentialsManager) {
    this.config = config;
    this.credentials = credentials;
  }

  async *execute(request: GatewayExecuteRequest): AsyncIterable<ExecutionEvent> {
    const creds = await this.getValidCredentials();
    const url = `${this.config.gatewayUrl}/api/v1/execute`;
    const controller = new AbortController();
    const timeout = request.timeoutMs ?? this.config.requestTimeoutMs ?? 30_000;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${creds.accessToken}`,
        'Accept': 'application/x-ndjson',
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    // 401 → auto-refresh and retry once
    if (response.status === 401 && this.config.autoRefresh !== false) {
      const refreshed = await this.credentials.refresh(creds);
      const retryResponse = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${refreshed.accessToken}`,
          'Accept': 'application/x-ndjson',
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      yield* this.readNdjsonStream(retryResponse, controller);
      return;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Gateway execute failed (${response.status}): ${body}`);
    }

    // Track abort controller for cancellation
    // Use requestId from first event, but we need to start reading first
    yield* this.readNdjsonStream(response, controller);
  }

  async cancel(executionId: string, reason?: string): Promise<void> {
    // Abort local stream if tracked
    const controller = this.abortControllers.get(executionId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(executionId);
    }

    // Send cancel request to Gateway
    const creds = await this.getValidCredentials();
    await fetch(`${this.config.gatewayUrl}/api/v1/execute/${executionId}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${creds.accessToken}`,
      },
      body: JSON.stringify({ reason: reason ?? 'user' }),
    });
  }

  async *subscribe(executionId: string): AsyncIterable<ExecutionEvent> {
    const creds = await this.getValidCredentials();
    const url = `${this.config.gatewayUrl}/api/v1/execute/${executionId}/events`;
    const controller = new AbortController();

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${creds.accessToken}`,
        'Accept': 'application/x-ndjson',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Gateway subscribe failed (${response.status}): ${body}`);
    }

    yield* this.readNdjsonStream(response, controller);
  }

  async ping(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.gatewayUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    for (const controller of this.abortControllers.values()) {
      controller.abort();
    }
    this.abortControllers.clear();
  }

  // ── Private ──

  private async getValidCredentials(): Promise<GatewayCredentials> {
    const creds = await this.credentials.load();
    if (!creds) {
      throw new Error(
        'Gateway credentials not found. Run "kb auth login" to authenticate.',
      );
    }

    if (this.credentials.isExpired(creds) && this.config.autoRefresh !== false) {
      return this.credentials.refresh(creds);
    }

    return creds;
  }

  private async *readNdjsonStream(
    response: Response,
    controller: AbortController,
  ): AsyncIterable<ExecutionEvent> {
    const body = response.body;
    if (!body) {
      throw new Error('Gateway returned empty response body');
    }

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let executionId: string | undefined;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {break;}

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // Keep last incomplete line in buffer
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) {continue;}

          const event = JSON.parse(trimmed) as ExecutionEvent;

          // Track executionId for cancellation
          if (!executionId && 'executionId' in event) {
            executionId = event.executionId;
            this.abortControllers.set(executionId, controller);
          }

          yield event;
        }
      }

      // Process remaining buffer
      if (buffer.trim()) {
        yield JSON.parse(buffer.trim()) as ExecutionEvent;
      }
    } finally {
      reader.releaseLock();
      if (executionId) {
        this.abortControllers.delete(executionId);
      }
    }
  }
}
