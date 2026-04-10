/**
 * @kb-labs/shared-testing-e2e
 *
 * E2E test harness for the KB Labs platform.
 *
 *   - `KbDevController` — boots/queries/stops real services via `kb-dev --json`.
 *   - `HttpClient` / `connectWs` / `readSse` — tiny HTTP/WS/SSE helpers for assertions.
 *   - `registerAgent` / `registerHost` — gateway auth helpers.
 *   - `createIsolatedProjectRoot` — temp dir with its own `.kb/` for mutating tests.
 *   - `makeTestNamespace` — unique-per-test resource namespace for isolation.
 *
 * Lifecycle contract: **one controller per test file**. Boot in `beforeAll`,
 * dispose in `afterAll`. Services are shared across `describe`/`it` blocks
 * inside the same file. Per-test boot is prohibitively slow.
 */

export { KbDevController } from './kb-dev-controller.js';
export type {
  ServiceId,
  ServiceState,
  ServiceStatus,
  ServiceHealth,
  StatusSnapshot,
  StatusSummary,
  KbDevAction,
  KbDevResult,
  KbDevControllerOptions,
  EnsureOptions,
} from './types.js';

export { HttpClient, httpClient } from './http-client.js';
export type { HttpClientOptions, HttpResponse } from './http-client.js';

export { connectWs, closeAllTrackedSockets } from './ws-client.js';
export type { WsOptions, WsHandle } from './ws-client.js';

export { readSse } from './sse-reader.js';
export type { SseEvent, SseOptions } from './sse-reader.js';

export { registerAgent, registerHost } from './jwt-helpers.js';
export type { AgentCredentials, HostCredentials } from './jwt-helpers.js';

export { createIsolatedProjectRoot } from './isolated-project-root.js';
export type { IsolatedProjectRoot, IsolatedProjectRootOptions } from './isolated-project-root.js';

export { makeTestNamespace } from './namespace.js';

export { findWorkspaceRoot, resolveWorkspaceRoot } from './workspace-root.js';
