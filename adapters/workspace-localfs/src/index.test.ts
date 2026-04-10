import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { LocalFsWorkspaceAdapter } from './index.js';

describe('LocalFsWorkspaceAdapter', () => {
  it('materializes and attaches workspace', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'kb-workspace-'));
    try {
      const adapter = new LocalFsWorkspaceAdapter({ workspace: { cwd: tmp } });
      const workspace = await adapter.materialize({ basePath: './demo' });
      expect(workspace.status).toBe('ready');

      const attachment = await adapter.attach({
        workspaceId: workspace.workspaceId,
        environmentId: 'env_1',
      });
      expect(attachment.mountPath).toBe('/workspace');

      const status = await adapter.getStatus(workspace.workspaceId);
      expect(status.status).toBe('attached');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
