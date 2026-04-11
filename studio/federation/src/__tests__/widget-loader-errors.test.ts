/**
 * Extended tests for loadPageComponent error paths and edge cases.
 * Complements widget-loader.test.ts (PageLoadError) and widget-loader-cache.test.ts (cache busting).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockInit, mockRegisterRemotes, mockLoadRemote } = vi.hoisted(() => ({
  mockInit: vi.fn(),
  mockRegisterRemotes: vi.fn(),
  mockLoadRemote: vi.fn(),
}));

vi.mock('@module-federation/runtime', () => ({
  init: mockInit,
  registerRemotes: mockRegisterRemotes,
  loadRemote: mockLoadRemote,
}));

vi.mock('@kb-labs/studio-devtools', () => ({
  devToolsStore: {
    getChannel: () => null,
    registerChannel: vi.fn(),
  },
  GenericChannel: vi.fn().mockImplementation(() => ({ push: vi.fn() })),
}));

import {
  initFederation,
  loadPageComponent,
  resetFederation,
  PageLoadError,
} from '../widget-loader.js';

beforeEach(() => {
  resetFederation();
  mockInit.mockClear();
  mockRegisterRemotes.mockClear();
  mockLoadRemote.mockClear();

  initFederation([{
    pluginId: 'test',
    remoteName: 'testPlugin',
    remoteEntryUrl: '/plugins/test/remoteEntry.js?v=1',
    pages: [],
    menus: [],
  }]);
});

describe('loadPageComponent — error scenarios', () => {
  it('throws PageLoadError after all retries exhausted', async () => {
    mockLoadRemote.mockRejectedValue(new Error('network error'));

    await expect(
      loadPageComponent('testPlugin', './Page', undefined, 1, 1),
    ).rejects.toThrow(PageLoadError);

    // 2 attempts total (initial + 1 retry)
    expect(mockLoadRemote).toHaveBeenCalledTimes(2);
  });

  it('PageLoadError includes cause chain', async () => {
    const networkErr = new Error('fetch failed');
    mockLoadRemote.mockRejectedValue(networkErr);

    try {
      await loadPageComponent('testPlugin', './Page', undefined, 0, 1);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(PageLoadError);
      const pageErr = err as PageLoadError;
      expect(pageErr.cause).toBe(networkErr);
      expect(pageErr.remoteName).toBe('testPlugin');
      expect(pageErr.exposedModule).toBe('./Page');
    }
  });

  it('throws when module resolves to null', async () => {
    mockLoadRemote.mockResolvedValue(null);

    await expect(
      loadPageComponent('testPlugin', './Page', undefined, 0, 1),
    ).rejects.toThrow(PageLoadError);
  });

  it('succeeds on retry after initial failure', async () => {
    const FakePage = () => null;
    mockLoadRemote
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce({ default: FakePage });

    const result = await loadPageComponent('testPlugin', './Page', undefined, 1, 1);

    expect(result.default).toBe(FakePage);
    expect(mockLoadRemote).toHaveBeenCalledTimes(2);
  });

  it('handles module without default export (warning path)', async () => {
    mockLoadRemote.mockResolvedValue({ NamedExport: () => null });

    const result = await loadPageComponent('testPlugin', './Page', undefined, 0, 1);

    // Should succeed even without default export
    expect(result).toBeDefined();
    expect(result.default).toBeUndefined();
  });

  it('strips ./ prefix from exposed module path', async () => {
    const FakePage = () => null;
    mockLoadRemote.mockResolvedValue({ default: FakePage });

    await loadPageComponent('testPlugin', './Dashboard', undefined, 0, 1);

    expect(mockLoadRemote).toHaveBeenCalledWith('testPlugin/Dashboard');
  });

  it('handles exposed module without ./ prefix', async () => {
    const FakePage = () => null;
    mockLoadRemote.mockResolvedValue({ default: FakePage });

    await loadPageComponent('testPlugin', 'Settings', undefined, 0, 1);

    expect(mockLoadRemote).toHaveBeenCalledWith('testPlugin/Settings');
  });
});
