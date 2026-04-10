import { describe, it, expect } from 'vitest';

import { KbDevController } from '../kb-dev-controller.js';
import { resolveWorkspaceRoot } from '../workspace-root.js';

/**
 * Controller smoke tests.
 *
 * These do NOT boot any services — they only verify that the controller can
 * locate kb-dev, query `status --json`, and return a well-formed snapshot.
 * Full boot-cycle tests are gated behind `KB_E2E_BOOT=1` (they require Docker
 * for redis and would otherwise fail on dev machines without Docker running).
 */
describe('KbDevController smoke', () => {
  it('constructs against the real workspace root', () => {
    const ctrl = new KbDevController();
    expect(ctrl.projectRoot).toBe(resolveWorkspaceRoot());
    expect(ctrl.kbDevBin).toContain('kb-dev');
  });

  it('throws when kbDevBin does not exist', () => {
    expect(
      () =>
        new KbDevController({
          projectRoot: resolveWorkspaceRoot(),
          kbDevBin: '/nonexistent/kb-dev',
        }),
    ).toThrow(/kb-dev binary not found/);
  });

  it('status() returns a parseable snapshot with services map', async () => {
    const ctrl = new KbDevController();
    const snap = await ctrl.status();
    expect(snap).toHaveProperty('ok');
    expect(snap).toHaveProperty('services');
    expect(snap).toHaveProperty('summary');
    expect(typeof snap.services).toBe('object');
    // Every known service from dev.config.json should appear in the snapshot.
    expect(snap.services).toHaveProperty('gateway');
    expect(snap.services).toHaveProperty('rest');
  });
});
