import { describe, it, expect, vi } from 'vitest';
import { toPosix, fromPosix, shouldIgnorePath } from '../utils/paths';

// Mock fs
vi.mock('node:fs', () => ({
  existsSync: vi.fn()
}));

describe('Path Utilities', () => {
  it('should convert to POSIX format', () => {
    expect(toPosix('path\\to\\file')).toBe('path/to/file');
    expect(toPosix('path/to/file')).toBe('path/to/file');
  });

  it('should convert from POSIX format', () => {
    expect(fromPosix('path/to/file')).toBe('path/to/file');
  });

  it('should ignore common patterns', () => {
    expect(shouldIgnorePath('node_modules/package')).toBe(true);
    expect(shouldIgnorePath('.git/config')).toBe(true);
    expect(shouldIgnorePath('dist/build.js')).toBe(true);
    expect(shouldIgnorePath('coverage/report.html')).toBe(true);
    expect(shouldIgnorePath('.turbo/cache')).toBe(true);
    expect(shouldIgnorePath('.vite/build')).toBe(true);
  });

  it('should allow .kb/mind/ but ignore other .kb/ paths', () => {
    expect(shouldIgnorePath('.kb/mind/index.json')).toBe(false);
    expect(shouldIgnorePath('.kb/devlink/config.json')).toBe(true);
    expect(shouldIgnorePath('.kb/other/file.json')).toBe(true);
  });

  it('should not ignore regular source files', () => {
    expect(shouldIgnorePath('src/index.ts')).toBe(false);
    expect(shouldIgnorePath('packages/core/src/utils.ts')).toBe(false);
    expect(shouldIgnorePath('README.md')).toBe(false);
  });

  it('should ignore log and temp files', () => {
    expect(shouldIgnorePath('app.log')).toBe(true);
    expect(shouldIgnorePath('temp.tmp')).toBe(true);
    expect(shouldIgnorePath('file.temp')).toBe(true);
  });
});
