/**
 * Tests for MF cache-busting logic:
 * - initFederation: one-time init, idempotent
 * - syncRemoteEntry: updates remote only when URL changes
 * - loadPageComponent: calls syncRemoteEntry before loadRemote
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- mocks ---
// vi.hoisted ensures these are available when vi.mock factories run (hoisted to top of file)

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

// Import after mocks are set up
import {
  initFederation,
  syncRemoteEntry,
  loadPageComponent,
  resetFederation,
} from '../widget-loader.js';
import type { StudioPluginEntryV2 } from '../types.js';

// --- helpers ---

function makePlugin(overrides: Partial<StudioPluginEntryV2> = {}): StudioPluginEntryV2 {
  return {
    pluginId: 'test-plugin',
    remoteName: 'testPlugin',
    remoteEntryUrl: '/plugins/test-plugin/widgets/remoteEntry.js?v=1000',
    pages: [],
    menus: [],
    ...overrides,
  };
}

// --- tests ---

describe('initFederation', () => {
  beforeEach(() => {
    resetFederation();
    vi.clearAllMocks();
  });

  it('calls init() on first invocation with all remotes', () => {
    const plugins = [
      makePlugin({ remoteName: 'pluginA', remoteEntryUrl: '/a/remoteEntry.js?v=1' }),
      makePlugin({ remoteName: 'pluginB', remoteEntryUrl: '/b/remoteEntry.js?v=2' }),
    ];

    initFederation(plugins);

    expect(mockInit).toHaveBeenCalledOnce();
    expect(mockInit).toHaveBeenCalledWith({
      name: 'studioHost',
      remotes: [
        { name: 'pluginA', entry: '/a/remoteEntry.js?v=1' },
        { name: 'pluginB', entry: '/b/remoteEntry.js?v=2' },
      ],
    });
  });

  it('does not call init() on subsequent invocations', () => {
    const plugins = [makePlugin()];

    initFederation(plugins);
    initFederation(plugins);
    initFederation(plugins);

    expect(mockInit).toHaveBeenCalledOnce();
  });

  it('does not call registerRemotes on first init', () => {
    initFederation([makePlugin()]);
    expect(mockRegisterRemotes).not.toHaveBeenCalled();
  });
});

describe('syncRemoteEntry', () => {
  beforeEach(() => {
    resetFederation();
    vi.clearAllMocks();
    // Seed known state via initFederation
    initFederation([makePlugin({ remoteName: 'pluginA', remoteEntryUrl: '/a/remoteEntry.js?v=1000' })]);
    vi.clearAllMocks(); // clear init calls, focus on sync
  });

  it('does nothing when URL is unchanged', () => {
    syncRemoteEntry('pluginA', '/a/remoteEntry.js?v=1000');

    expect(mockRegisterRemotes).not.toHaveBeenCalled();
  });

  it('calls registerRemotes({ force: true }) when URL changes', () => {
    syncRemoteEntry('pluginA', '/a/remoteEntry.js?v=9999');

    expect(mockRegisterRemotes).toHaveBeenCalledOnce();
    expect(mockRegisterRemotes).toHaveBeenCalledWith(
      [{ name: 'pluginA', entry: '/a/remoteEntry.js?v=9999' }],
      { force: true },
    );
  });

  it('updates the tracked URL after sync so subsequent calls are no-ops', () => {
    syncRemoteEntry('pluginA', '/a/remoteEntry.js?v=9999');
    vi.clearAllMocks();

    syncRemoteEntry('pluginA', '/a/remoteEntry.js?v=9999');

    expect(mockRegisterRemotes).not.toHaveBeenCalled();
  });

  it('registers a previously unknown remote without force semantics issue', () => {
    // 'pluginB' was not in initFederation plugins
    syncRemoteEntry('pluginB', '/b/remoteEntry.js?v=1');

    expect(mockRegisterRemotes).toHaveBeenCalledWith(
      [{ name: 'pluginB', entry: '/b/remoteEntry.js?v=1' }],
      { force: true },
    );
  });

  it('handles multiple remotes independently', () => {
    // Reset and re-init with both plugins so both are tracked
    resetFederation();
    initFederation([
      makePlugin({ remoteName: 'pluginC', remoteEntryUrl: '/c/remoteEntry.js?v=1' }),
      makePlugin({ remoteName: 'pluginD', remoteEntryUrl: '/d/remoteEntry.js?v=1' }),
    ]);
    vi.clearAllMocks();

    // Only pluginC changed
    syncRemoteEntry('pluginC', '/c/remoteEntry.js?v=2');
    syncRemoteEntry('pluginD', '/d/remoteEntry.js?v=1'); // unchanged

    expect(mockRegisterRemotes).toHaveBeenCalledOnce();
    expect(mockRegisterRemotes).toHaveBeenCalledWith(
      [{ name: 'pluginC', entry: '/c/remoteEntry.js?v=2' }],
      { force: true },
    );
  });
});

describe('loadPageComponent', () => {
  beforeEach(() => {
    resetFederation();
    vi.clearAllMocks();
    initFederation([makePlugin({ remoteName: 'testPlugin', remoteEntryUrl: '/test/remoteEntry.js?v=100' })]);
    vi.clearAllMocks();
  });

  it('calls syncRemoteEntry before loadRemote when remoteEntryUrl is provided', async () => {
    const fakeModule = { default: () => null };
    mockLoadRemote.mockResolvedValueOnce(fakeModule);

    await loadPageComponent('testPlugin', './Page', '/test/remoteEntry.js?v=200');

    expect(mockRegisterRemotes).toHaveBeenCalledWith(
      [{ name: 'testPlugin', entry: '/test/remoteEntry.js?v=200' }],
      { force: true },
    );
    expect(mockLoadRemote).toHaveBeenCalledWith('testPlugin/Page');
  });

  it('does not call registerRemotes when URL is unchanged', async () => {
    const fakeModule = { default: () => null };
    mockLoadRemote.mockResolvedValueOnce(fakeModule);

    await loadPageComponent('testPlugin', './Page', '/test/remoteEntry.js?v=100');

    expect(mockRegisterRemotes).not.toHaveBeenCalled();
    expect(mockLoadRemote).toHaveBeenCalledWith('testPlugin/Page');
  });

  it('skips syncRemoteEntry when remoteEntryUrl is not provided', async () => {
    const fakeModule = { default: () => null };
    mockLoadRemote.mockResolvedValueOnce(fakeModule);

    await loadPageComponent('testPlugin', './Page');

    expect(mockRegisterRemotes).not.toHaveBeenCalled();
    expect(mockLoadRemote).toHaveBeenCalledWith('testPlugin/Page');
  });

  it('strips leading ./ from exposed module in the loadRemote path', async () => {
    mockLoadRemote.mockResolvedValueOnce({ default: () => null });

    await loadPageComponent('testPlugin', './Dashboard');

    expect(mockLoadRemote).toHaveBeenCalledWith('testPlugin/Dashboard');
  });

  it('returns the loaded module', async () => {
    const FakeComponent = () => null;
    mockLoadRemote.mockResolvedValueOnce({ default: FakeComponent });

    const result = await loadPageComponent('testPlugin', './Page', '/test/remoteEntry.js?v=100');

    expect(result.default).toBe(FakeComponent);
  });

  it('retries on failure and eventually throws PageLoadError', async () => {
    mockLoadRemote.mockRejectedValue(new Error('network error'));

    await expect(
      loadPageComponent('testPlugin', './Page', undefined, 1, 0),
    ).rejects.toMatchObject({
      name: 'PageLoadError',
      remoteName: 'testPlugin',
      exposedModule: './Page',
    });

    // 1 initial attempt + 1 retry = 2 calls
    expect(mockLoadRemote).toHaveBeenCalledTimes(2);
  });
});

describe('resetFederation', () => {
  beforeEach(() => {
    resetFederation();
    vi.clearAllMocks();
  });

  it('allows initFederation to run init() again after reset', () => {
    const plugins = [makePlugin()];

    initFederation(plugins);
    expect(mockInit).toHaveBeenCalledOnce();

    resetFederation();
    vi.clearAllMocks();

    initFederation(plugins);
    expect(mockInit).toHaveBeenCalledOnce();
  });

  it('clears known remotes so syncRemoteEntry treats all URLs as new', () => {
    initFederation([makePlugin({ remoteName: 'pluginA', remoteEntryUrl: '/a/remoteEntry.js?v=1' })]);
    vi.clearAllMocks();

    resetFederation();
    // After reset, same URL is "unknown" → should trigger registerRemotes
    syncRemoteEntry('pluginA', '/a/remoteEntry.js?v=1');

    expect(mockRegisterRemotes).toHaveBeenCalledOnce();
  });
});
