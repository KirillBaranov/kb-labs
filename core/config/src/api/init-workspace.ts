/**
 * @module @kb-labs/core/config/api/init-workspace
 * Initialize workspace configuration with idempotent operations
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { KbError, ERROR_HINTS } from '../errors/kb-error';
import { findGitRoot } from './read-config';
import { writeFileAtomic, ensureWithinWorkspace } from '../utils/fs-atomic';
import { toFsProduct } from '../utils/product-normalize';
import type { InitWorkspaceOptions, InitResult, InitAction } from '../types/init';

/**
 * Generate diff preview (first ~20 lines) for conflicts
 */
function generateDiffPreview(oldContent: string, newContent: string): string {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  const maxLines = 20;
  const diff: string[] = [];
  
  for (let i = 0; i < Math.min(maxLines, Math.max(oldLines.length, newLines.length)); i++) {
    const oldLine = oldLines[i] || '';
    const newLine = newLines[i] || '';
    
    if (oldLine !== newLine) {
      if (oldLine) {diff.push(`- ${oldLine}`);}
      if (newLine) {diff.push(`+ ${newLine}`);}
    }
  }
  
  if (oldLines.length > maxLines || newLines.length > maxLines) {
    diff.push('... truncated');
  }
  
  return diff.slice(0, 20).join('\n');
}

/**
 * Find workspace config file, walking up to git root
 * Prioritizes .kb/ location over root
 */
async function findWorkspaceConfig(
  cwd: string
): Promise<{ path: string; format: 'yaml' | 'json' } | null> {
  const filenames = [
    '.kb/kb.config.yaml',
    '.kb/kb.config.yml',
    '.kb/kb.config.json',
  ];
  const gitRoot = await findGitRoot(cwd);
  const stopDir = gitRoot || path.parse(cwd).root;
  
  let dir = path.resolve(cwd);
  
  while (true) {
    for (const filename of filenames) {
      const candidate = path.join(dir, filename);
      try {
        await fs.access(candidate);
        const format = filename.endsWith('.json') ? 'json' : 'yaml';
        return { path: candidate, format };
      } catch {
        // Continue to next filename
      }
    }
    
    // Stop at git root or filesystem root
    if (dir === stopDir || dir === path.dirname(dir)) {
      break;
    }
    dir = path.dirname(dir);
  }
  
  return null;
}

/**
 * Initialize or update workspace configuration
 */
export async function initWorkspaceConfig(
  opts: InitWorkspaceOptions
): Promise<InitResult> {
  const cwd = path.resolve(opts.cwd);
  const result: InitResult = {
    actions: [],
    created: [],
    updated: [],
    skipped: [],
    warnings: [],
  };
  
  if (opts.profiles && Object.keys(opts.profiles).length > 0) {
    result.warnings.push(
      'profiles option is deprecated. Define profiles[] inside kb.config.json (Profiles v2).'
    );
  }
  
  // Find existing config
  const existing = await findWorkspaceConfig(cwd);
  const format = existing?.format || opts.format || 'yaml';
  const configFileName = format === 'json' ? 'kb.config.json' : 'kb.config.yaml';
  // Create .kb directory if needed for new configs
  const configPath = existing?.path || path.join(cwd, '.kb', configFileName);
  
  // Ensure we're writing within workspace
  ensureWithinWorkspace(configPath, cwd);
  
  // Build new config structure
  const newConfig: any = {
    schemaVersion: '1.0',
    products: {},
  };
  
  // Add product sections
  if (opts.products && opts.products.length > 0) {
    for (const product of opts.products) {
      const fsProduct = toFsProduct(product);
      newConfig.products[product] = {};
    }
  }
  
  // Add preset if specified
  if (opts.presetRef !== undefined) {
    newConfig.$extends = opts.presetRef;
  }
  
  // Check if config already exists
  if (existing) {
    try {
      const existingContent = await fs.readFile(existing.path, 'utf-8');
      const existingData = format === 'json' 
        ? JSON.parse(existingContent)
        : YAML.parse(existingContent);
      
      // Merge with existing config (only add missing keys)
      let modified = false;
      
      // Ensure schemaVersion
      if (!existingData.schemaVersion) {
        existingData.schemaVersion = '1.0';
        modified = true;
      }
      
      // Merge products
      if (opts.products) {
        if (!existingData.products) {
          existingData.products = {};
          modified = true;
        }
        for (const product of opts.products) {
          if (!existingData.products[product]) {
            existingData.products[product] = {};
            modified = true;
          }
        }
      }
      
      // Merge preset
      if (opts.presetRef !== undefined && existingData.$extends !== opts.presetRef) {
        existingData.$extends = opts.presetRef;
        modified = true;
      }
      
      if (!modified) {
        // No changes needed
        result.actions.push({ kind: 'skip', path: configPath });
        result.skipped.push(configPath);
        return result;
      }
      
      // Serialize new content
      const newContent = format === 'json'
        ? JSON.stringify(existingData, null, 2) + '\n'
        : YAML.stringify(existingData);
      
      // Check for conflicts
      if (!opts.force && existingContent !== newContent) {
        const action: InitAction = {
          kind: 'conflict',
          path: configPath,
          previewDiff: generateDiffPreview(existingContent, newContent),
        };
        result.actions.push(action);
        result.warnings.push(`Config file has changes, use --force to overwrite: ${configPath}`);
        return result;
      }
      
      // Write updated config
      if (!opts.dryRun) {
        await writeFileAtomic(configPath, newContent);
      }
      
      result.actions.push({ kind: 'update', path: configPath });
      result.updated.push(configPath);
    } catch (error) {
      throw new KbError(
        'ERR_CONFIG_INVALID',
        `Failed to read or parse existing config: ${existing.path}`,
        ERROR_HINTS.ERR_CONFIG_INVALID,
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  } else {
    // Create new config
    const content = format === 'json'
      ? JSON.stringify(newConfig, null, 2) + '\n'
      : YAML.stringify(newConfig);
    
    if (!opts.dryRun) {
      await writeFileAtomic(configPath, content);
    }
    
    result.actions.push({ kind: 'write', path: configPath });
    result.created.push(configPath);
  }
  
  return result;
}

