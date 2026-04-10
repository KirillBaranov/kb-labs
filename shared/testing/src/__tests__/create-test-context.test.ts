import { describe, it, expect, afterEach } from 'vitest';
import { platform, resetPlatform } from '@kb-labs/core-runtime';
import { createTestContext } from '../create-test-context.js';
import { mockLLM } from '../mock-llm.js';
import { mockCache } from '../mock-cache.js';

describe('createTestContext', () => {
  afterEach(() => {
    resetPlatform();
  });

  describe('basic creation', () => {
    it('should create context with default values', () => {
      const { ctx, cleanup } = createTestContext();
      cleanup();

      expect(ctx.pluginId).toBe('test-plugin');
      expect(ctx.pluginVersion).toBe('0.0.0');
      expect(ctx.host).toBe('cli');
      expect(ctx.requestId).toBe('test-trace:test-span');
    });

    it('should accept custom pluginId and host', () => {
      const { ctx, cleanup } = createTestContext({
        pluginId: 'my-plugin',
        host: 'rest',
      });
      cleanup();

      expect(ctx.pluginId).toBe('my-plugin');
      expect(ctx.host).toBe('rest');
    });

    it('should accept custom config', () => {
      const { ctx, cleanup } = createTestContext<{ apiKey: string }>({
        config: { apiKey: 'test-key' },
      });
      cleanup();

      expect(ctx.config!.apiKey).toBe('test-key');
    });
  });

  describe('singleton sync', () => {
    it('should sync platform adapters to global singleton by default', () => {
      const llm = mockLLM().onAnyComplete().respondWith('synced');
      const { ctx, cleanup } = createTestContext({ platform: { llm } });

      // ctx.platform has the mock
      expect(ctx.platform.llm).toBe(llm);

      // Global singleton also has the mock
      expect(platform.llm).toBe(llm);

      cleanup();
    });

    it('should not sync when syncSingleton is false', () => {
      const llm = mockLLM();
      const { ctx, cleanup } = createTestContext({
        platform: { llm },
        syncSingleton: false,
      });

      // ctx.platform has the mock
      expect(ctx.platform.llm).toBe(llm);

      // Global singleton should NOT have it (it was reset before the test)
      expect(platform.hasAdapter('llm')).toBe(false);

      cleanup();
    });

    it('cleanup should reset the global singleton', () => {
      const llm = mockLLM();
      const { cleanup } = createTestContext({ platform: { llm } });

      expect(platform.hasAdapter('llm')).toBe(true);

      cleanup();

      expect(platform.hasAdapter('llm')).toBe(false);
    });
  });

  describe('default mocks are spies', () => {
    it('should provide LLM with vi.fn() spies', async () => {
      const { ctx, cleanup } = createTestContext();

      await ctx.platform.llm.complete('test');
      expect(ctx.platform.llm.complete).toHaveBeenCalledWith('test');

      cleanup();
    });

    it('should provide cache with vi.fn() spies', async () => {
      const { ctx, cleanup } = createTestContext();

      await ctx.platform.cache.set('key', 'value');
      expect(ctx.platform.cache.set).toHaveBeenCalledWith('key', 'value');

      cleanup();
    });

    it('should provide UI with vi.fn() spies', () => {
      const { ctx, cleanup } = createTestContext();

      ctx.ui.info('test message');
      expect(ctx.ui.info).toHaveBeenCalledWith('test message');

      cleanup();
    });

    it('should provide runtime with vi.fn() spies', async () => {
      const { ctx, cleanup } = createTestContext();

      await ctx.runtime.fs.readFile('test.txt');
      expect(ctx.runtime.fs.readFile).toHaveBeenCalledWith('test.txt');

      cleanup();
    });

    it('should provide plugin API with vi.fn() spies', async () => {
      const { ctx, cleanup } = createTestContext();

      await ctx.api.state.set('key', 'value');
      expect(ctx.api.state.set).toHaveBeenCalledWith('key', 'value');

      cleanup();
    });

    it('should provide environment/workspace/snapshot APIs by default', async () => {
      const { ctx, cleanup } = createTestContext();

      const workspace = await ctx.api.workspace.materialize({ sourceRef: 'repo://main' });
      const environment = await ctx.api.environment.create({ templateId: 'node20' });
      const snapshot = await ctx.api.snapshot.capture({ workspaceId: workspace.workspaceId });

      expect(workspace.workspaceId).toBeDefined();
      expect(environment.environmentId).toBeDefined();
      expect(snapshot.snapshotId).toBeDefined();
      expect(ctx.api.workspace.materialize).toHaveBeenCalled();
      expect(ctx.api.environment.create).toHaveBeenCalled();
      expect(ctx.api.snapshot.capture).toHaveBeenCalled();

      cleanup();
    });
  });

  describe('platform overrides', () => {
    it('should use custom LLM mock', async () => {
      const llm = mockLLM()
        .onComplete('generate').respondWith('custom response');

      const { ctx, cleanup } = createTestContext({ platform: { llm } });

      const res = await ctx.platform.llm.complete('generate commit');
      expect(res.content).toBe('custom response');

      cleanup();
    });

    it('should use custom cache mock', async () => {
      const cache = mockCache({ 'pre': 'loaded' });
      const { ctx, cleanup } = createTestContext({ platform: { cache } });

      expect(await ctx.platform.cache.get('pre')).toBe('loaded');

      cleanup();
    });
  });

  describe('host contexts', () => {
    it('should generate CLI host context by default', () => {
      const { ctx, cleanup } = createTestContext({ host: 'cli' });
      expect(ctx.hostContext).toEqual({ host: 'cli', argv: ['test'], flags: {} });
      cleanup();
    });

    it('should generate REST host context', () => {
      const { ctx, cleanup } = createTestContext({ host: 'rest' });
      expect(ctx.hostContext.host).toBe('rest');
      cleanup();
    });

    it('should generate workflow host context', () => {
      const { ctx, cleanup } = createTestContext({ host: 'workflow' });
      expect(ctx.hostContext.host).toBe('workflow');
      cleanup();
    });

    it('should accept custom host context', () => {
      const custom = { host: 'cli' as const, argv: ['custom'], flags: { verbose: true } };
      const { ctx, cleanup } = createTestContext({ hostContext: custom });
      expect(ctx.hostContext).toEqual(custom);
      cleanup();
    });
  });
});
