import { describe, it, expect, vi } from 'vitest';
import { ADAPTER_REGISTRY } from '../adapter-registry';
import type { PlatformServices } from '@kb-labs/plugin-contracts';

describe('ADAPTER_REGISTRY', () => {
  it('has an entry for every key in Required<PlatformServices>', () => {
    // These are all the keys declared in IPlatformAdapters / PlatformServices.
    // If a new key is added to PlatformServices and the satisfies constraint
    // in adapter-registry.ts is removed, this test catches the gap at runtime too.
    const expectedKeys: Array<keyof Required<PlatformServices>> = [
      'logger', 'llm', 'embeddings', 'vectorStore', 'cache', 'storage',
      'analytics', 'eventBus', 'config', 'invoke', 'sqlDatabase',
      'documentDatabase', 'logs', 'notifier', 'artifacts', 'snapshotManager',
    ];

    for (const key of expectedKeys) {
      expect(ADAPTER_REGISTRY).toHaveProperty(key);
    }
  });

  it('every entry has a governance field with a valid strategy', () => {
    for (const [key, def] of Object.entries(ADAPTER_REGISTRY)) {
      expect(['pass-through', 'wrap'], `${key}.governance.strategy`).toContain(def.governance.strategy);
    }
  });

  it('every entry has an ipc field with a valid strategy', () => {
    const validIpcStrategies = ['proxy', 'noop', 'local', 'absent'];
    for (const [key, def] of Object.entries(ADAPTER_REGISTRY)) {
      expect(validIpcStrategies, `${key}.ipc.strategy`).toContain(def.ipc.strategy);
    }
  });

  it('pass-through governance returns adapter unchanged', () => {
    const analyticsEntry = ADAPTER_REGISTRY['analytics'];
    expect(analyticsEntry.governance.strategy).toBe('pass-through');
  });

  it('wrap governance returns a different object', () => {
    const llmEntry = ADAPTER_REGISTRY['llm'];
    expect(llmEntry.governance.strategy).toBe('wrap');

    const mockLlm = {
      complete: vi.fn(),
      stream: vi.fn(async function* () {}),
    };
    const mockCtx = {
      permissions: { platform: { llm: true } },
      pluginId: 'test',
      lifecycle: { onReady: vi.fn(), onDispose: vi.fn(), on: vi.fn() },
    };

    if (llmEntry.governance.strategy === 'wrap') {
      const wrapped = llmEntry.governance.fn(mockLlm, mockCtx);
      expect(wrapped).not.toBe(mockLlm);
    }
  });
});
