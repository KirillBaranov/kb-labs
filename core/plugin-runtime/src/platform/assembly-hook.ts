import { assemblePlatform } from './pipeline.js';

/**
 * Returns the assemblyHook required by createServiceBootstrap().
 *
 * Wraps raw platform adapters with the full assembly pipeline:
 *   resourceBrokerFactory → analyticsFactory → routerFactory → postAssemblyFactory
 *
 * @param getLogger - Optional lazy getter for a diagnostic logger. Evaluated
 *   at hook execution time (during initPlatform), not at call time. Pass
 *   `() => platform.logger` to emit assembly diagnostics when KB_DEBUG=true.
 *   Services that don't need assembly diagnostics can omit this.
 *
 * Pass the result as `assemblyHook` in ServiceBootstrapOptions.
 * Services that bypass createServiceBootstrap entirely (sandbox IPC workers via
 * initPlatform directly) do not need this.
 */
export function makeAssemblyHook(
  getLogger?: () => Parameters<typeof assemblePlatform>[3],
): (
  raw: object,
  broker: unknown,
  cfg: Partial<Record<string, unknown>>,
) => Partial<Record<string, unknown>> {
  return (raw, broker, cfg) =>
    assemblePlatform(
      raw as Parameters<typeof assemblePlatform>[0],
      cfg as never,
      broker as never,
      getLogger?.(),
    ) as unknown as Partial<Record<string, unknown>>;
}
