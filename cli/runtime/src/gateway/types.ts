/**
 * @module cli-core/gateway/types
 *
 * Gateway client types for CLI thin client.
 */

import type { ExecutionEvent } from '@kb-labs/core-contracts';

/**
 * Credentials for Gateway connection.
 * Stored in ~/.kb/credentials.json.
 */
export interface GatewayCredentials {
  /** Gateway server URL */
  gatewayUrl: string;
  /** Access token (short-lived, 15 min) */
  accessToken: string;
  /** Refresh token (long-lived, 30 days) */
  refreshToken: string;
  /** Unix timestamp (ms) when accessToken expires */
  expiresAt: number;
}

/**
 * Gateway client configuration.
 */
export interface GatewayClientConfig {
  /** Gateway URL. @default from credentials.json or "http://localhost:4000" */
  gatewayUrl: string;
  /** Timeout for HTTP requests in ms. @default 30000 */
  requestTimeoutMs?: number;
  /** Auto-refresh tokens on 401. @default true */
  autoRefresh?: boolean;
}

/**
 * Request to execute a handler via Gateway.
 * CLI maps its argv/flags into this format.
 */
export interface GatewayExecuteRequest {
  /** Plugin ID (from plugin manifest) */
  pluginId: string;
  /** Handler file reference */
  handlerRef: string;
  /** Export name from handler file */
  exportName?: string;
  /** Input data (argv, flags) */
  input: unknown;
  /** Timeout in ms */
  timeoutMs?: number;
}

/**
 * Gateway client interface.
 * Sends requests to Gateway and receives streaming execution events.
 */
export interface IGatewayClient {
  /**
   * Execute handler via Gateway.
   * Returns AsyncIterable of execution events.
   */
  execute(request: GatewayExecuteRequest): AsyncIterable<ExecutionEvent>;

  /**
   * Cancel an execution.
   */
  cancel(executionId: string, reason?: string): Promise<void>;

  /**
   * Subscribe to events of an existing execution.
   */
  subscribe(executionId: string): AsyncIterable<ExecutionEvent>;

  /**
   * Check that Gateway is available.
   */
  ping(): Promise<boolean>;

  /**
   * Close connections.
   */
  close(): Promise<void>;
}

/**
 * Credentials manager interface.
 * Manages Gateway credentials stored in ~/.kb/credentials.json.
 */
export interface ICredentialsManager {
  /** Load credentials from disk */
  load(): Promise<GatewayCredentials | null>;
  /** Save credentials to disk (chmod 600) */
  save(credentials: GatewayCredentials): Promise<void>;
  /** Clear credentials (logout) */
  clear(): Promise<void>;
  /** Check if access token is expired */
  isExpired(credentials: GatewayCredentials): boolean;
  /** Refresh tokens via Gateway API */
  refresh(credentials: GatewayCredentials): Promise<GatewayCredentials>;
}
