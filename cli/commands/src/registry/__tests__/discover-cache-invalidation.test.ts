/**
 * Regression test for the discovery disk-cache invalidation bug found while
 * building kb-create's scaffold->build->run e2e journey (see
 * tools/kb-create/e2e/journey_solo_dev_test.go): a project's
 * `.kb/marketplace.lock` doesn't exist until the first plugin is linked into
 * it (e.g. `kb scaffold run plugin <name>`), and `computeMarketplaceLockHashAt`
 * returns '' for a missing file. The old invalidation check
 * (`currentHash && cache.storedHash && currentHash !== cache.storedHash`)
 * required BOTH sides to be truthy, so a cache written before the lock file
 * existed (storedHash undefined) never invalidated once the file appeared —
 * `undefined && anything` is always false. In practice this meant: run any
 * `kb` command in a fresh project (which writes a cache), then
 * `kb scaffold run plugin demo`, then `kb demo hello` — the new plugin's
 * commands stayed unregistered ("Unknown command: demo hello") until the
 * 5-minute disk-cache TTL expired.
 *
 * Uses real tmp directories and real fs (no fs mocking, unlike
 * discover.test.ts) because the bug is specifically about how loadCache/
 * saveCache round-trip through actual file presence/absence — mocking fs
 * would hide exactly the transition this test needs to exercise.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { __test } from '../discover';

const { loadCache, saveCache } = __test;

describe('discovery cache invalidation — marketplace.lock presence changes', () => {
  let platformRoot: string;
  let projectRoot: string;

  beforeEach(async () => {
    const base = await mkdtemp(join(tmpdir(), 'kb-discover-cache-'));
    platformRoot = join(base, 'platform');
    projectRoot = join(base, 'project');
    await mkdir(join(platformRoot, '.kb'), { recursive: true });
    await mkdir(join(projectRoot, '.kb'), { recursive: true });
    // A stable platform-scope lock so this test isolates the project-scope
    // transition — platformMarketplaceLockHash stays constant throughout.
    await writeFile(
      join(platformRoot, '.kb', 'marketplace.lock'),
      JSON.stringify({ schema: 'kb.marketplace/2', installed: {} }),
    );
  });

  afterEach(async () => {
    await rm(join(platformRoot, '..'), { recursive: true, force: true });
  });

  it('invalidates once a project marketplace.lock is created after the cache was written', async () => {
    const roots = { platformRoot, projectRoot };

    // Cache written while the project has no marketplace.lock yet — the
    // exact state `kb scaffold run plugin demo`'s own startup discovery
    // writes, before its action creates the lock file.
    await saveCache(projectRoot, [], roots);

    const cacheWithNoProjectLock = await loadCache(projectRoot, roots);
    expect(cacheWithNoProjectLock).not.toBeNull();
    expect(cacheWithNoProjectLock?.projectMarketplaceLockHash).toBeUndefined();

    // Simulate `kb scaffold run plugin demo` linking the new plugin.
    await writeFile(
      join(projectRoot, '.kb', 'marketplace.lock'),
      JSON.stringify({
        schema: 'kb.marketplace/2',
        installed: { '@kb-labs/demo': { enabled: true } },
      }),
    );

    // The next `kb` invocation (e.g. `kb demo hello`) must see a cache miss
    // here, not a stale hit missing the demo plugin's commands.
    const cacheAfterLinking = await loadCache(projectRoot, roots);
    expect(cacheAfterLinking).toBeNull();
  });

  it('invalidates when an existing project marketplace.lock is edited', async () => {
    await writeFile(
      join(projectRoot, '.kb', 'marketplace.lock'),
      JSON.stringify({ schema: 'kb.marketplace/2', installed: {} }),
    );
    const roots = { platformRoot, projectRoot };

    await saveCache(projectRoot, [], roots);
    const before = await loadCache(projectRoot, roots);
    expect(before).not.toBeNull();
    expect(before?.projectMarketplaceLockHash).toBeDefined();

    await writeFile(
      join(projectRoot, '.kb', 'marketplace.lock'),
      JSON.stringify({
        schema: 'kb.marketplace/2',
        installed: { '@kb-labs/demo': { enabled: true } },
      }),
    );

    const after = await loadCache(projectRoot, roots);
    expect(after).toBeNull();
  });

  it('stays a cache hit when nothing changed', async () => {
    const roots = { platformRoot, projectRoot };
    await saveCache(projectRoot, [], roots);

    const result = await loadCache(projectRoot, roots);
    expect(result).not.toBeNull();
  });
});
