/**
 * @kb-labs/shared-testing-e2e
 *
 * E2E test harness for the KB Labs platform.
 *
 * CLI handler testing (no daemon required):
 *   - `mockCLIInput` — builds typed CLIInput<F> for handler tests
 *   - `mockObject` — partial override factory for any interface
 *   - `createCapturedUI` — UIFacade that records all calls for assertion
 *   - `createMockContext` — minimal PluginContextV3 mock for handler tests
 *
 * SSE helpers:
 *   - `collectSseEvents` — drain SSE stream into array
 *   - `waitForSseEvent` — wait for specific event type
 *   - `expectSseTerminates` — assert stream closes on its own
 *   - `assertSseOrder` / `assertNoSseDuplicates` — assertion helpers
 *
 * WebSocket helpers:
 *   - `withWs` — auto-close wrapper
 *   - `expectWsMessage` — wait for message matching predicate
 *   - `expectWsClose` — assert clean close
 *
 * Infrastructure:
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

// --- CLI handler testing helpers ---
export { mockCLIInput } from './cli/mock-cli-input.js';
export type { MockCLIInputOptions } from './cli/mock-cli-input.js';

export { mockObject } from './cli/mock-object.js';

export { createCapturedUI } from './cli/captured-ui.js';
export type { UICapture, CapturedUI } from './cli/captured-ui.js';

export { createMockContext } from './cli/mock-context.js';
export type { MockContextOptions } from './cli/mock-context.js';

// Re-exported from @kb-labs/shared-testing for one-import convenience
export {
  createTestContext,
  testCommand,
  createMockUI,
  createMockRuntime,
  createMockPluginAPI,
  createMockTrace,
  mockLLM,
  mockCache,
  mockLogger,
} from '@kb-labs/shared-testing';
export type {
  CreateTestContextOptions,
  TestContextResult,
  TestCommandOptions,
  TestCommandResult,
} from '@kb-labs/shared-testing';

// --- SSE helpers ---
export { collectSseEvents, waitForSseEvent, expectSseTerminates } from './sse/collect.js';
export type { CollectSseOptions } from './sse/collect.js';

export { assertSseOrder, assertNoSseDuplicates } from './sse/assert.js';

// --- WebSocket helpers ---
export { withWs } from './ws/lifecycle.js';
export { expectWsMessage, expectWsClose } from './ws/assert.js';
