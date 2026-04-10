/**
 * Additional tests for mind-indexer
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fsp } from 'node:fs';
import { join } from 'node:path';
import { initMindStructure, updateIndexes } from '../index';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fixturePath = join(__dirname, '../../../../fixtures/small-project');
const mediumFixturePath = join(__dirname, '../../../../fixtures/medium-project');

describe('Mind Indexer', () => {
  beforeEach(async () => {
    // Clean up any existing mind structure
    try {
      await fsp.rm(join(fixturePath, '.kb'), { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  afterEach(async () => {
    // Clean up after tests
    try {
      await fsp.rm(join(fixturePath, '.kb'), { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should initialize mind structure', async () => {
    const mindDir = await initMindStructure({ cwd: fixturePath });
    expect(mindDir).toBeDefined();
    
    // Check that mind directory was created
    const mindPath = join(fixturePath, '.kb', 'mind');
    const exists = await fsp.access(mindPath).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });

  it('should update indexes', async () => {
    // Initialize first
    await initMindStructure({ cwd: fixturePath });
    
    // Update indexes
    const result = await updateIndexes({
      cwd: fixturePath,
      timeBudgetMs: 5000
    });
    
    expect(result).toBeDefined();
    expect(result.api).toBeDefined();
    expect(result.budget).toBeDefined();
    expect(result.durationMs).toBeGreaterThan(0);
  });

  it('should respect time budget', async () => {
    await initMindStructure({ cwd: fixturePath });
    
    const result = await updateIndexes({
      cwd: fixturePath,
      timeBudgetMs: 1 // Very small budget
    });
    
    expect(result.budget.limitMs).toBe(1);
    expect(result.budget.usedMs).toBeGreaterThanOrEqual(0);
  });

  it('should handle empty workspace', async () => {
    const emptyPath = join(__dirname, '../../../../fixtures/empty-test');
    
    try {
      await fsp.mkdir(emptyPath, { recursive: true });
      
      const mindDir = await initMindStructure({ cwd: emptyPath });
      expect(mindDir).toBeDefined();
      
      // Should create empty structure
      const exists = await fsp.access(mindDir).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    } finally {
      // Cleanup
      try {
        await fsp.rm(emptyPath, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  it('removes deleted files from indexes', async () => {
    await initMindStructure({ cwd: fixturePath });
    await updateIndexes({
      cwd: fixturePath,
      timeBudgetMs: 5000
    });

    const targetFile = join(fixturePath, 'src', 'utils.ts');
    const originalContent = await fsp.readFile(targetFile, 'utf8');

    try {
      await fsp.rm(targetFile);

      const result = await updateIndexes({
        cwd: fixturePath,
        changed: ['src/utils.ts'],
        timeBudgetMs: 5000
      });

      expect(result.api.removed).toBeGreaterThanOrEqual(1);

      const apiIndexPath = join(fixturePath, '.kb', 'mind', 'api-index.json');
      const depsPath = join(fixturePath, '.kb', 'mind', 'deps.json');

      const apiIndex = JSON.parse(await fsp.readFile(apiIndexPath, 'utf8'));
      const depsGraph = JSON.parse(await fsp.readFile(depsPath, 'utf8'));

      expect(apiIndex.files['src/utils.ts']).toBeUndefined();
      const edgeReferencingRemovedFile = (depsGraph.edges ?? []).find(
        (edge: any) => edge.from === 'src/index.ts' && edge.to === 'src/utils.ts'
      );
      expect(edgeReferencingRemovedFile).toBeUndefined();
    } finally {
      await fsp.writeFile(targetFile, originalContent, 'utf8');
      await updateIndexes({
        cwd: fixturePath,
        changed: ['src/utils.ts'],
        timeBudgetMs: 5000
      });
    }
  });
});

describe('Mind Indexer with path aliases', () => {
  beforeEach(async () => {
    try {
      await fsp.rm(join(mediumFixturePath, '.kb'), { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  afterEach(async () => {
    try {
      await fsp.rm(join(mediumFixturePath, '.kb'), { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('resolves tsconfig path aliases and external packages', async () => {
    await initMindStructure({ cwd: mediumFixturePath });
    await updateIndexes({
      cwd: mediumFixturePath,
      timeBudgetMs: 5000
    });

    const depsPath = join(mediumFixturePath, '.kb', 'mind', 'deps.json');
    const depsGraph = JSON.parse(await fsp.readFile(depsPath, 'utf8'));

    const hasAliasEdge = (depsGraph.edges ?? []).some(
      (edge: any) =>
        typeof edge.from === 'string' &&
        typeof edge.to === 'string' &&
        edge.from.endsWith('src/index.ts') &&
        edge.to.endsWith('src/services/core.ts')
    );
    expect(hasAliasEdge).toBe(true);

    const summary = depsGraph.summary || {};
    const externalDeps = summary.externalDeps || [];
    expect(externalDeps.includes('lodash')).toBe(true);
  });

  it('falls back to manual alias resolution when baseUrl is missing', async () => {
    const tsconfigPath = join(mediumFixturePath, 'tsconfig.json');
    const originalContent = await fsp.readFile(tsconfigPath, 'utf8');
    const originalConfig = JSON.parse(originalContent);

    const mutatedConfig = {
      ...originalConfig,
      compilerOptions: {
        ...(originalConfig.compilerOptions ?? {})
      }
    };
    delete mutatedConfig.compilerOptions.baseUrl;

    try {
      await fsp.writeFile(tsconfigPath, JSON.stringify(mutatedConfig, null, 2));

      await initMindStructure({ cwd: mediumFixturePath });
      await updateIndexes({
        cwd: mediumFixturePath,
        timeBudgetMs: 5000
      });

      const depsPath = join(mediumFixturePath, '.kb', 'mind', 'deps.json');
      const depsGraph = JSON.parse(await fsp.readFile(depsPath, 'utf8'));

      const hasAliasEdge = (depsGraph.edges ?? []).some(
        (edge: any) =>
          typeof edge.from === 'string' &&
          typeof edge.to === 'string' &&
          edge.from.endsWith('src/index.ts') &&
          edge.to.endsWith('src/services/core.ts')
      );
      expect(hasAliasEdge).toBe(true);
    } finally {
      await fsp.writeFile(tsconfigPath, JSON.stringify(originalConfig, null, 2));
    }
  });
});
