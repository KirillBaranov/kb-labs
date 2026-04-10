import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentWorkspaceAdapter } from '../index.js';
import type { MaterializeWorkspaceRequest } from '@kb-labs/core-platform';

// ── fetch mock helpers ────────────────────────────────────────────────────────

function mockFetchOk(result: unknown): void {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => ({ result }),
    text: async () => JSON.stringify({ result }),
  })));
}

function mockFetchError(status: number, body: string): void {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: false,
    status,
    text: async () => body,
  })));
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('AgentWorkspaceAdapter', () => {
  let cacheDir: string;

  beforeEach(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), 'ws-agent-test-'));
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await rm(cacheDir, { recursive: true, force: true });
  });

  describe('materialize', () => {
    it('calls /internal/dispatch with filesystem.fetchWorkspace', async () => {
      const files = [{ path: 'index.ts', content: 'export {}' }];
      mockFetchOk(files);

      const adapter = new AgentWorkspaceAdapter({
        gatewayUrl: 'http://localhost:4000',
        internalSecret: 'test-secret',
        namespaceId: 'ns-1',
        cacheDir,
      });

      const req: MaterializeWorkspaceRequest = { workspaceId: 'ws-test', basePath: '/workspace' };
      await adapter.materialize(req);

      const fetchMock = vi.mocked(fetch);
      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://localhost:4000/internal/dispatch');
      expect((init.headers as Record<string, string>)['x-internal-secret']).toBe('test-secret');
      const body = JSON.parse(init.body as string);
      expect(body.adapter).toBe('filesystem');
      expect(body.method).toBe('fetchWorkspace');
      expect(body.namespaceId).toBe('ns-1');
    });

    it('writes fetched files to cacheDir/workspaceId/', async () => {
      const files = [
        { path: 'index.ts', content: 'export {}' },
        { path: join('src', 'app.ts'), content: 'const x = 1;' },
      ];
      mockFetchOk(files);

      const adapter = new AgentWorkspaceAdapter({ cacheDir, internalSecret: 'secret' });

      const descriptor = await adapter.materialize({ workspaceId: 'ws-abc', basePath: '.' });

      expect(descriptor.workspaceId).toBe('ws-abc');
      expect(descriptor.status).toBe('ready');
      expect(descriptor.rootPath).toBe(join(cacheDir, 'ws-abc'));
      expect(descriptor.provider).toBe('workspace-agent');

      const indexContent = await readFile(join(cacheDir, 'ws-abc', 'index.ts'), 'utf-8');
      expect(indexContent).toBe('export {}');

      const appContent = await readFile(join(cacheDir, 'ws-abc', 'src', 'app.ts'), 'utf-8');
      expect(appContent).toBe('const x = 1;');
    });

    it('generates workspaceId when not provided', async () => {
      mockFetchOk([]);

      const adapter = new AgentWorkspaceAdapter({ cacheDir, internalSecret: 'secret' });
      const descriptor = await adapter.materialize({ basePath: '.' });

      expect(descriptor.workspaceId).toMatch(/^ws_/);
    });

    it('stores file count in descriptor metadata', async () => {
      const files = [
        { path: 'a.ts', content: 'x' },
        { path: 'b.ts', content: 'y' },
        { path: 'c.ts', content: 'z' },
      ];
      mockFetchOk(files);

      const adapter = new AgentWorkspaceAdapter({ cacheDir, internalSecret: 'secret' });
      const descriptor = await adapter.materialize({ workspaceId: 'ws-meta', basePath: '.' });

      expect(descriptor.metadata?.fileCount).toBe(3);
    });

    it('throws when dispatch returns non-array', async () => {
      mockFetchOk({ notAnArray: true });

      const adapter = new AgentWorkspaceAdapter({ cacheDir, internalSecret: 'secret' });

      await expect(adapter.materialize({ workspaceId: 'ws-bad', basePath: '.' }))
        .rejects.toThrow('expected array of files');
    });

    it('throws when fetch returns non-ok status', async () => {
      mockFetchError(503, '{"error":"No host connected"}');

      const adapter = new AgentWorkspaceAdapter({ cacheDir, internalSecret: 'secret' });

      await expect(adapter.materialize({ workspaceId: 'ws-err', basePath: '.' }))
        .rejects.toThrow('dispatch failed (503)');
    });

    it('passes hostId when configured', async () => {
      mockFetchOk([]);

      const adapter = new AgentWorkspaceAdapter({
        cacheDir,
        internalSecret: 'secret',
        namespaceId: 'ns-x',
        hostId: 'host-specific',
      });

      await adapter.materialize({ workspaceId: 'ws-host', basePath: '.' });

      const fetchMock = vi.mocked(fetch);
      const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
      expect(body.hostId).toBe('host-specific');
    });

    it('uses basePath for remotePath', async () => {
      mockFetchOk([]);

      const adapter = new AgentWorkspaceAdapter({ cacheDir, internalSecret: 'secret' });
      await adapter.materialize({ workspaceId: 'ws-path', basePath: '/home/user/myproject' });

      const fetchMock = vi.mocked(fetch);
      const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
      expect(body.args).toEqual(['/home/user/myproject']);
    });
  });

  describe('attach / getStatus / release', () => {
    it('attach returns mountPath', async () => {
      mockFetchOk([]);
      const adapter = new AgentWorkspaceAdapter({ cacheDir, internalSecret: 'secret' });
      await adapter.materialize({ workspaceId: 'ws-1', basePath: '.' });

      const att = await adapter.attach({ workspaceId: 'ws-1', environmentId: 'env-1' });
      expect(att.workspaceId).toBe('ws-1');
      expect(att.mountPath).toBe('/workspace');
    });

    it('getStatus returns ready after materialize', async () => {
      mockFetchOk([]);
      const adapter = new AgentWorkspaceAdapter({ cacheDir, internalSecret: 'secret' });
      await adapter.materialize({ workspaceId: 'ws-2', basePath: '.' });

      const status = await adapter.getStatus('ws-2');
      expect(status.status).toBe('ready');
    });

    it('getStatus throws for unknown workspace', async () => {
      const adapter = new AgentWorkspaceAdapter({ cacheDir, internalSecret: 'secret' });
      await expect(adapter.getStatus('unknown')).rejects.toThrow('Workspace not found');
    });

    it('release transitions status to released', async () => {
      mockFetchOk([]);
      const adapter = new AgentWorkspaceAdapter({ cacheDir, internalSecret: 'secret' });
      await adapter.materialize({ workspaceId: 'ws-3', basePath: '.' });
      await adapter.release('ws-3');

      const status = await adapter.getStatus('ws-3');
      expect(status.status).toBe('released');
    });
  });

  describe('getCapabilities', () => {
    it('reports remote:true', () => {
      const adapter = new AgentWorkspaceAdapter({ internalSecret: 'secret' });
      const caps = adapter.getCapabilities();
      expect(caps.custom?.remote).toBe(true);
      expect(caps.supportsAttach).toBe(true);
    });
  });

  describe('createAdapter factory', () => {
    it('exports createAdapter default function', async () => {
      const mod = await import('../index.js');
      expect(typeof mod.createAdapter).toBe('function');
      const adapter = mod.createAdapter({ internalSecret: 'test' });
      expect(adapter).toBeInstanceOf(AgentWorkspaceAdapter);
    });
  });
});
