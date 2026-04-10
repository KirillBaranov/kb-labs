/**
 * Host Wrappers
 *
 * Transform RunResult<T> from runner layer into host-specific formats.
 *
 * Each host (CLI, REST, Workflow, etc.) has its own wrapper that:
 * - Takes RunResult<T> with raw data and execution metadata
 * - Returns host-specific format with appropriate metadata
 */

// CLI Host
export { wrapCliResult } from './cli-wrapper.js';

// REST Host
export { wrapRestResult, unwrapRestData } from './rest-wrapper.js';
export type { RestResultWithMeta } from './rest-wrapper.js';

// Future hosts:
// export { wrapWorkflowResult } from './workflow-wrapper.js';
// export { wrapWebhookResult } from './webhook-wrapper.js';
