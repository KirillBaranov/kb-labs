import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { ResourceTracker } from '../cleanup/resource-tracker.js';

describe('ResourceTracker', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'kb-tracker-'));
  });

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  it('tracks and removes temporary files on cleanup', async () => {
    const tracker = new ResourceTracker();

    const tmpFile = path.join(tmpDir, 'test.tmp');
    await fsp.writeFile(tmpFile, 'temp data');
    tracker.addTmpFile(tmpFile);

    // File exists before cleanup
    await expect(fsp.access(tmpFile)).resolves.toBeUndefined();

    await tracker.cleanup();

    // File removed after cleanup
    await expect(fsp.access(tmpFile)).rejects.toThrow();
  });

  it('runs cleanup callbacks', async () => {
    const tracker = new ResourceTracker();
    const callback = vi.fn(async () => {});

    tracker.onCleanup(callback);
    await tracker.cleanup();

    expect(callback).toHaveBeenCalledOnce();
  });

  it('handles missing tmp files gracefully', async () => {
    const tracker = new ResourceTracker();
    tracker.addTmpFile('/nonexistent/file.tmp');

    // Should not throw
    await tracker.cleanup();
  });

  it('handles failing cleanup callbacks gracefully', async () => {
    const tracker = new ResourceTracker();
    tracker.onCleanup(async () => { throw new Error('cleanup-fail'); });

    // Should not throw (Promise.allSettled)
    await tracker.cleanup();
  });

  it('clears tracking after cleanup', async () => {
    const tracker = new ResourceTracker();
    const callback = vi.fn(async () => {});
    tracker.onCleanup(callback);
    tracker.addTmpFile('/tmp/x.tmp');

    await tracker.cleanup();
    // Second cleanup should not re-run callbacks
    callback.mockClear();
    await tracker.cleanup();

    expect(callback).not.toHaveBeenCalled();
  });

  it('supports multiple tmp files and callbacks', async () => {
    const tracker = new ResourceTracker();

    const file1 = path.join(tmpDir, 'a.tmp');
    const file2 = path.join(tmpDir, 'b.tmp');
    await fsp.writeFile(file1, 'a');
    await fsp.writeFile(file2, 'b');

    tracker.addTmpFile(file1);
    tracker.addTmpFile(file2);

    const cb1 = vi.fn(async () => {});
    const cb2 = vi.fn(async () => {});
    tracker.onCleanup(cb1);
    tracker.onCleanup(cb2);

    await tracker.cleanup();

    await expect(fsp.access(file1)).rejects.toThrow();
    await expect(fsp.access(file2)).rejects.toThrow();
    expect(cb1).toHaveBeenCalledOnce();
    expect(cb2).toHaveBeenCalledOnce();
  });
});
