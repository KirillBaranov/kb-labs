/**
 * Workflow Output Normalizer
 *
 * Converts raw handler return values into workflow step outputs.
 * Ensures consistent Record<string, unknown> shape regardless of
 * handler type (workflow handler, CLI command, builtin) or
 * execution mode (in-process, subprocess, worker-pool, remote).
 *
 * This is the single point of conversion from ExecutionResult.data
 * to step.outputs — no other code should do this transformation.
 */

/**
 * Check if value looks like a CLI CommandResult ({ exitCode, result }).
 * CLI command handlers return this shape; workflow handlers return raw data.
 *
 * Requires BOTH `exitCode` (number) AND `result` key to be present.
 * This prevents false positives from shell handler output which has
 * `exitCode` but uses `stdout`/`stderr` instead of `result`.
 */
function isCommandResult(value: unknown): value is { exitCode: number; result?: unknown; meta?: Record<string, unknown> } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'exitCode' in value &&
    'result' in value &&
    typeof (value as Record<string, unknown>).exitCode === 'number'
  );
}

/**
 * Convert raw handler output to workflow step outputs.
 *
 * Contract:
 * | Handler returns                          | step.outputs              |
 * |------------------------------------------|---------------------------|
 * | { foo: 'bar' }                           | { foo: 'bar' }            |
 * | { exitCode: 0, result: { x: 1 } }       | { x: 1 }                 |
 * | { exitCode: 0, result: 'hello' }         | { result: 'hello' }      |
 * | { exitCode: 0, result: undefined }       | {}                        |
 * | { exitCode: 0, result: null }            | {}                        |
 * | { exitCode: 0 }  (no result key)         | { exitCode: 0 }           |
 * | { stdout: '...', exitCode: 0, ok: true } | { stdout, exitCode, ok }  |
 * | 'hello' (primitive)                      | { result: 'hello' }      |
 * | 42 (number)                              | { result: 42 }           |
 * | undefined / void                         | {}                        |
 * | null                                     | {}                        |
 */
export function toWorkflowOutputs(data: unknown): Record<string, unknown> {
  // CLI CommandResult — extract the payload
  if (isCommandResult(data)) {
    const inner = data.result;
    if (typeof inner === 'object' && inner !== null) {
      return inner as Record<string, unknown>;
    }
    return inner !== undefined && inner !== null ? { result: inner } : {};
  }

  // Object — use as-is
  if (typeof data === 'object' && data !== null) {
    return data as Record<string, unknown>;
  }

  // Primitive — wrap in { result }
  if (data !== undefined && data !== null) {
    return { result: data };
  }

  // void / undefined / null — empty outputs
  return {};
}
