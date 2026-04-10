/**
 * Meta indexer for KB Labs Mind
 */

import { promises as fsp } from 'node:fs';
import { join } from 'node:path';
import type { ProjectMeta, ProductMeta } from '@kb-labs/mind-types';
import type { IndexerContext } from '../types/index';
import { getGenerator } from '@kb-labs/mind-core';

export async function indexMeta(ctx: IndexerContext): Promise<void> {
  try {
    const packageJsonPath = join(ctx.cwd, 'package.json');
    const packageJson = JSON.parse(await fsp.readFile(packageJsonPath, 'utf8'));
    
    // Detect if monorepo
    const workspaces = packageJson.workspaces || [];
    const products: ProductMeta[] = [];
    
    if (workspaces.length > 0) {
      // Scan workspace packages
      for (const pattern of workspaces) {
        const pkgs = await findWorkspacePackages(ctx.cwd, pattern);
        for (const pkg of pkgs) {
          products.push(await extractProductMeta(pkg));
        }
      }
    } else {
      // Single package repo
      products.push({
        id: packageJson.name?.split('/').pop() || 'main',
        name: packageJson.name || 'Unknown',
        description: packageJson.description || '',
        maintainers: [packageJson.author?.name || 'unknown'],
        repo: packageJson.repository?.url,
        docs: await findDocs(ctx.cwd)
      });
    }
    
    const meta: ProjectMeta = {
      schemaVersion: '1.0',
      generator: getGenerator(),
      project: packageJson.name || 'unknown',
      products,
      generatedAt: new Date().toISOString()
    };
    
    const metaPath = join(ctx.cwd, '.kb', 'mind', 'meta.json');
    await fsp.writeFile(metaPath, JSON.stringify(meta, null, 2));
    
    ctx.log({ level: 'info', msg: `Indexed ${products.length} products` });
  } catch (error: any) {
    ctx.log({ level: 'warn', msg: 'Failed to index meta', error: error.message });
  }
}

async function findWorkspacePackages(cwd: string, pattern: string): Promise<string[]> {
  // Simplified: scan directories matching pattern
  const baseDir = pattern.replace('/*', '');
  try {
    const entries = await fsp.readdir(join(cwd, baseDir), { withFileTypes: true });
    const packages: string[] = [];
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const pkgPath = join(cwd, baseDir, entry.name);
        try {
          await fsp.access(join(pkgPath, 'package.json'));
          packages.push(pkgPath);
        } catch {
          // No package.json, skip
        }
      }
    }
    
    return packages;
  } catch {
    return [];
  }
}

async function extractProductMeta(pkgPath: string): Promise<ProductMeta> {
  const pkgJson = JSON.parse(await fsp.readFile(join(pkgPath, 'package.json'), 'utf8'));
  return {
    id: pkgJson.name?.split('/').pop() || 'unknown',
    name: pkgJson.name || 'Unknown',
    description: pkgJson.description || '',
    maintainers: [pkgJson.author?.name || 'unknown'],
    tags: pkgJson.keywords || [],
    repo: pkgJson.repository?.url,
    docs: await findDocs(pkgPath),
    dependencies: Object.keys(pkgJson.dependencies || {})
  };
}

async function findDocs(basePath: string): Promise<string[]> {
  const docs: string[] = [];
  const docsDir = join(basePath, 'docs');
  try {
    const files = await fsp.readdir(docsDir, { recursive: true });
    for (const file of files as string[]) {
      if (file.endsWith('.md')) {
        docs.push(`docs/${file}`);
      }
    }
  } catch {
    // No docs directory
  }
  return docs;
}
