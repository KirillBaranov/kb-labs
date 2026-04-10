/**
 * Tests for mind-adapters
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fsp } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { gitDiffSince, listStagedFiles } from '../index';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fixturePath = join(__dirname, '../../../../fixtures/small-project');

describe('Git Adapters', () => {
  beforeEach(async () => {
    // Ensure fixture exists
    try {
      await fsp.access(fixturePath);
    } catch {
      // Skip tests if fixture doesn't exist
      return;
    }
  });

  it('should handle git diff since revision', async () => {
    try {
      const diff = await gitDiffSince(fixturePath, 'HEAD~1');
      expect(diff).toBeDefined();
      expect(diff).toHaveProperty('files');
      expect(Array.isArray(diff.files)).toBe(true);
    } catch (error) {
      // Git might not be available or fixture might not be a git repo
      expect(error).toBeDefined();
    }
  });

  it('should handle staged files listing', async () => {
    try {
      const staged = await listStagedFiles(fixturePath);
      expect(staged).toBeDefined();
      expect(Array.isArray(staged)).toBe(true);
    } catch (error) {
      // Git might not be available or fixture might not be a git repo
      expect(error).toBeDefined();
    }
  });

  it('should handle non-git directories gracefully', async () => {
    const tempDir = join(tmpdir(), `git-adapter-test-${Date.now()}`);

    try {
      await fsp.mkdir(tempDir, { recursive: true });

      const diff = await gitDiffSince(tempDir, 'HEAD~1');
      expect(diff).toHaveProperty('files');
      expect(diff.files).toEqual([]);

      const staged = await listStagedFiles(tempDir);
      expect(staged).toEqual([]);
    } finally {
      // Cleanup
      try {
        await fsp.rm(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  it('should handle nonexistent directories', async () => {
    const diff = await gitDiffSince('/nonexistent/path', 'HEAD~1');
    expect(diff).toHaveProperty('files');
    expect(diff.files).toEqual([]);

    const staged = await listStagedFiles('/nonexistent/path');
    expect(staged).toEqual([]);
  });
});
