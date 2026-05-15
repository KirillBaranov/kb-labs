/**
 * Generic mock factory — creates a partial override of any object/interface.
 * Useful for mocking HTTP clients in handler tests without spawning real daemons.
 *
 * @example
 * const client = mockObject(defaultWorkflowClient, {
 *   runWorkflow: async () => ({ runId: 'r-123', status: 'queued' }),
 * })
 */
export function mockObject<T extends object>(defaults: T, overrides?: Partial<T>): T {
  return { ...defaults, ...overrides };
}
