import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resetPlatform } from '@kb-labs/core-runtime';
import { COLLECTIONS } from '@kb-labs/steward-contracts';
import { exportSnapshot } from '../export.js';
import { addProject } from '../project.js';
import { listEvents } from '../event.js';

describe('exportSnapshot', () => {
  beforeEach(() => {
    resetPlatform();
  });

  afterEach(() => {
    resetPlatform();
  });

  it('dumps every declared collection, including empty ones', async () => {
    const snapshot = await exportSnapshot();

    expect(snapshot.exportedAt).toBeTypeOf('number');
    for (const name of Object.values(COLLECTIONS)) {
      expect(Object.prototype.hasOwnProperty.call(snapshot.collections, name)).toBe(true);
    }
  });

  it('reflects prior writes in the dumped documents', async () => {
    const project = await addProject({ name: 'Snapshotted', status: 'active' });
    const snapshot = await exportSnapshot();

    const projects = snapshot.collections[COLLECTIONS.projects] as Array<{ id: string }>;
    expect(projects.some((p) => p.id === project.id)).toBe(true);
  });

  it('appends an export.completed event with per-collection counts', async () => {
    await addProject({ name: 'Counted', status: 'active' });
    await exportSnapshot();

    const events = await listEvents({ kind: 'export.completed' });
    expect(events).toHaveLength(1);
    const counts = events[0]!.meta?.counts as Record<string, number>;
    expect(counts[COLLECTIONS.projects]).toBeGreaterThanOrEqual(1);
  });
});
