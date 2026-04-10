/**
 * @kb-labs/shared-tool-kit/testing
 *
 * Mock utilities for testing agent tools.
 *
 * @example
 * ```ts
 * import { mockTool } from '@kb-labs/shared-tool-kit/testing';
 *
 * const tool = mockTool('fs_read', { success: true, output: 'file content' });
 * await tool.executor({ path: 'file.ts' });
 * console.log(tool.getCalls()); // [{ path: 'file.ts' }]
 * ```
 */

import type { ToolShape } from '../factory.js';

/**
 * A mock tool with built-in call tracking for tests.
 */
export interface MockToolInstance extends ToolShape {
  /** All calls made to this tool's executor */
  getCalls: () => readonly Record<string, unknown>[];
  /** Last call arguments, or undefined if never called */
  getLastCall: () => Record<string, unknown> | undefined;
  /** True if executor was called at least once */
  wasCalled: () => boolean;
  /** Number of times executor was called */
  callCount: () => number;
  /** Replace the response returned by executor */
  respondWith: (response: unknown) => MockToolInstance;
}

/**
 * Create a mock tool for testing.
 *
 * The mock records all calls and returns a configurable response.
 *
 * @param name - Tool name (used in definition)
 * @param response - Default response returned by executor (default: `{}`)
 *
 * @example
 * ```ts
 * const fsRead = mockTool('fs_read', { success: true, output: 'hello' });
 *
 * // Use in registry mock or pass directly
 * await fsRead.executor({ path: 'foo.ts' });
 *
 * expect(fsRead.wasCalled()).toBe(true);
 * expect(fsRead.getLastCall()).toEqual({ path: 'foo.ts' });
 * ```
 */
export function mockTool(name: string, response: unknown = {}): MockToolInstance {
  const calls: Record<string, unknown>[] = [];
  let currentResponse = response;

  const instance: MockToolInstance = {
    definition: {
      type: 'function' as const,
      function: {
        name,
        description: `Mock tool: ${name}`,
        parameters: {
          type: 'object' as const,
          properties: {},
        },
      },
    },
    executor: async (input: Record<string, unknown>) => {
      calls.push(input);
      return currentResponse;
    },
    getCalls: () => calls,
    getLastCall: () => calls[calls.length - 1],
    wasCalled: () => calls.length > 0,
    callCount: () => calls.length,
    respondWith: (newResponse: unknown) => {
      currentResponse = newResponse;
      return instance;
    },
  };

  return instance;
}
