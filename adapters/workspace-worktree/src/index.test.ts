import { describe, expect, it } from 'vitest';
import { WorktreeWorkspaceAdapter } from './index.js';

describe('WorktreeWorkspaceAdapter', () => {
  it('should export createAdapter factory', async () => {
    const { createAdapter } = await import('./index.js');
    expect(typeof createAdapter).toBe('function');
  });

  it('should create adapter with default config', () => {
    const adapter = new WorktreeWorkspaceAdapter();
    expect(adapter).toBeDefined();
    expect(typeof adapter.materialize).toBe('function');
    expect(typeof adapter.release).toBe('function');
    expect(typeof adapter.getStatus).toBe('function');
    expect(typeof adapter.getCapabilities).toBe('function');
  });

  it('should return capabilities', () => {
    const adapter = new WorktreeWorkspaceAdapter();
    const caps = adapter.getCapabilities();
    expect(caps.supportsAttach).toBe(true);
    expect(caps.supportsRelease).toBe(true);
  });

  it('should return released status for unknown workspace', async () => {
    const adapter = new WorktreeWorkspaceAdapter();
    const status = await adapter.getStatus('nonexistent');
    expect(status.status).toBe('released');
  });

  it('should reject invalid branch names', async () => {
    const adapter = new WorktreeWorkspaceAdapter();
    await expect(
      adapter.materialize({ sourceRef: 'main; rm -rf /' })
    ).rejects.toThrow('Invalid branch name');
  });
});
