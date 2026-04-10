/**
 * @kb-labs/shared-tool-kit
 *
 * Tool factory for building agent tools consistently.
 *
 * @example
 * ```ts
 * import { createTool } from '@kb-labs/shared-tool-kit';
 *
 * const myTool = createTool({
 *   name: 'my_tool',
 *   description: 'Does something useful',
 *   parameters: {
 *     type: 'object',
 *     properties: { value: { type: 'string' } },
 *     required: ['value'],
 *   },
 *   execute: async ({ value }, context) => {
 *     return { success: true, output: `Got: ${value}` };
 *   },
 * });
 * ```
 *
 * For mocks in tests, import from `@kb-labs/shared-tool-kit/testing`.
 */

export {
  createTool,
  type ToolSpec,
  type ToolShape,
  type ToolDefinitionShape,
} from './factory.js';
