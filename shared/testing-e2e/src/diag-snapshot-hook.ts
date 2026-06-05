import type { KbDevController } from './kb-dev-controller.js';

const SNAPSHOT_PATH = '/tmp/kb-e2e-diag.json';

/**
 * Register a Vitest onTestFailed hook that writes a DiagSnapshot when a test fails.
 *
 * Safe to call in non-Vitest environments (Playwright, Node scripts) — the vitest
 * import is dynamic and failures are caught silently.
 *
 * Usage in beforeAll:
 *   await registerDiagSnapshotHook(ctrl);
 */
export async function registerDiagSnapshotHook(ctrl: KbDevController): Promise<void> {
  // Dynamic import keeps this file free of static vitest dep (Playwright-safe)
  const vitest = await import('vitest').catch(() => null);
  if (!vitest?.onTestFailed) { return; }

  vitest.onTestFailed(async () => {
    const collector = ctrl.getDiagCollector();
    if (!collector) { return; }

    try {
      await collector.writeSnapshot(SNAPSHOT_PATH);

      // Vitest 3.x attachment API — degrade gracefully if unavailable
      try {
        const { inject } = await import('vitest');
        const attachments = (inject as (key: string) => unknown | undefined)('testAttachments') as
          | { attach(name: string, opts: { path: string; contentType: string }): Promise<void> }
          | undefined;
        await attachments?.attach('kb-e2e-diag.json', {
          path: SNAPSHOT_PATH,
          contentType: 'application/json',
        });
      } catch {
        process.stderr.write(`[KB_DEBUG] DiagSnapshot written to ${SNAPSHOT_PATH}\n`);
      }
    } catch {
      // Never let a diagnostic failure propagate into the test result
    }
  });
}
