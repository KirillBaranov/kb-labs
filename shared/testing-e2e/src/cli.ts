/**
 * @kb-labs/shared-testing-e2e/cli
 *
 * CLI handler test helpers. Requires vitest (uses vi.fn()).
 * Import this sub-path from vitest handler tests, NOT from Playwright e2e specs.
 *
 * For Playwright-safe helpers (WS, SSE, HTTP) import from @kb-labs/shared-testing-e2e.
 */

export { mockCLIInput } from './cli/mock-cli-input.js';
export type { MockCLIInputOptions } from './cli/mock-cli-input.js';

export { mockObject } from './cli/mock-object.js';

export { createCapturedUI } from './cli/captured-ui.js';
export type { UICapture, CapturedUI } from './cli/captured-ui.js';

export { createMockContext } from './cli/mock-context.js';
export type { MockContextOptions } from './cli/mock-context.js';
