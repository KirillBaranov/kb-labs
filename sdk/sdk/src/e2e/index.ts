/**
 * @kb-labs/sdk/e2e
 *
 * Playwright-safe e2e infrastructure for KB Labs service tests.
 * Import this subpath in e2e test files instead of @kb-labs/shared-testing-e2e directly.
 *
 * Chain: shared/testing-e2e (implementation) → @kb-labs/sdk/e2e (public surface) → e2e tests
 *
 * @example
 * ```typescript
 * import { spawnCliCommand, collectSseEvents, KbDevController, WORKFLOW } from '@kb-labs/sdk/e2e';
 *
 * const result = await spawnCliCommand(['workflow', 'run', '--workflow-id=e2e-hello', '--json']);
 * expect(result.exitCode).toBe(0);
 * ```
 */

// Service URL constants — read from env at runtime, fall back to local dev defaults
export const GATEWAY     = process.env['GATEWAY_URL']     ?? 'http://localhost:4000'
export const REST        = process.env['REST_URL']        ?? 'http://localhost:5050'
export const MARKETPLACE = process.env['MARKETPLACE_URL'] ?? 'http://localhost:5070'
export const REGISTRY    = process.env['REGISTRY_URL']    ?? 'http://localhost:5071'
export const WORKFLOW    = process.env['WORKFLOW_URL']    ?? 'http://localhost:7778'
export const STATE       = process.env['STATE_URL']       ?? 'http://localhost:7777'

// CLI process runner
export { spawnCliCommand, spawnCliJson } from '@kb-labs/shared-testing-e2e';
export type { CliResult, SpawnCliOptions } from '@kb-labs/shared-testing-e2e';

// Service controller
export { KbDevController } from '@kb-labs/shared-testing-e2e';
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
} from '@kb-labs/shared-testing-e2e';

// HTTP / WS / SSE primitives
export { HttpClient, httpClient } from '@kb-labs/shared-testing-e2e';
export type { HttpClientOptions, HttpResponse } from '@kb-labs/shared-testing-e2e';

export { connectWs, closeAllTrackedSockets } from '@kb-labs/shared-testing-e2e';
export type { WsOptions, WsHandle } from '@kb-labs/shared-testing-e2e';

export { readSse } from '@kb-labs/shared-testing-e2e';
export type { SseEvent, SseOptions } from '@kb-labs/shared-testing-e2e';

// SSE helpers
export { collectSseEvents, waitForSseEvent, expectSseTerminates } from '@kb-labs/shared-testing-e2e';
export type { CollectSseOptions } from '@kb-labs/shared-testing-e2e';
export { assertSseOrder, assertNoSseDuplicates } from '@kb-labs/shared-testing-e2e';

// WebSocket helpers
export { withWs, expectWsMessage, expectWsClose } from '@kb-labs/shared-testing-e2e';

// Auth helpers
export { registerAgent, registerHost } from '@kb-labs/shared-testing-e2e';
export type { AgentCredentials, HostCredentials } from '@kb-labs/shared-testing-e2e';

// Project isolation
export { createIsolatedProjectRoot } from '@kb-labs/shared-testing-e2e';
export type { IsolatedProjectRoot, IsolatedProjectRootOptions } from '@kb-labs/shared-testing-e2e';

// Utilities
export { makeTestNamespace } from '@kb-labs/shared-testing-e2e';
export { findWorkspaceRoot, resolveWorkspaceRoot } from '@kb-labs/shared-testing-e2e';
