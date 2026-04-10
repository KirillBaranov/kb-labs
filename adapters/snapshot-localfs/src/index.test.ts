import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { LocalFsSnapshotAdapter } from './index.js';

describe('LocalFsSnapshotAdapter', () => {
  it('captures and restores workspace snapshot', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'kb-snapshot-'));
    try {
      const workspaceId = 'ws_1';
      const workspaceRoot = path.join(tmp, 'demo');
      await mkdir(path.join(tmp, '.kb/runtime/workspace-registry'), { recursive: true });
      await mkdir(workspaceRoot, { recursive: true });
      await writeFile(
        path.join(tmp, '.kb/runtime/workspace-registry', `${workspaceId}.json`),
        JSON.stringify({ workspaceId, rootPath: workspaceRoot }, null, 2),
        'utf8'
      );

      const filePath = path.join(workspaceRoot, 'hello.txt');
      await writeFile(filePath, 'v1', 'utf8');

      const snapshot = new LocalFsSnapshotAdapter({ workspace: { cwd: tmp } });
      const snap = await snapshot.capture({ workspaceId, namespace: 'demo' });

      await writeFile(filePath, 'v2', 'utf8');
      await snapshot.restore({
        snapshotId: snap.snapshotId,
        workspaceId,
        overwrite: true,
      });

      const restored = await readFile(filePath, 'utf8');
      expect(restored).toBe('v1');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
