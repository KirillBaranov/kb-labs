/**
 * @module @kb-labs/core/config/api/product-config
 * High-level product configuration resolver with layered merge
 */

import { promises as fsp } from 'node:fs';
import path from 'node:path';
// Note: KbError and ERROR_HINTS are available if needed for future error handling
import { readWorkspaceConfig } from './read-config';
import { layeredMergeWithTrace } from '../merge/layered-merge';
import { toFsProduct } from '../utils/product-normalize';
import type { ResolveOptions, ProductConfigResult, ConfigLayer } from '../types';
import { computeConfigHash } from '../hash/config-hash';
import { resolvePreset, getPresetConfigForProduct } from '../preset/resolve-preset';
import { updateLockfile } from '../lockfile/lockfile';

/**
 * Get product configuration with layered merge and trace
 */
export async function getProductConfig<T = Record<string, unknown>>(
  opts: ResolveOptions,
  schema: unknown
): Promise<ProductConfigResult<T>> {
  const { cwd, product, cli = {}, writeFinal = false, profileLayer } = opts;
  const fsProduct = toFsProduct(product);
  
  // Read workspace configuration
  const workspaceConfig = await readWorkspaceConfig(cwd);
  
  // Build configuration layers
  const layers: ConfigLayer[] = [];
  
  // 1. Runtime defaults
  layers.push({
    label: 'runtime',
    value: getRuntimeDefaults(product),
    source: 'runtime:defaults',
  });
  
  // 2. Profile defaults
  if (profileLayer && profileLayer.products) {
    // profileLayer.products is already the product-specific overlay (not a map of products)
    const profileOverlay = profileLayer.products as Record<string, unknown>;

    layers.push({
      label: 'profile',
      value: profileOverlay,
      source: profileLayer.source,
    });

    if (profileLayer.scope && profileLayer.scope.products) {
      // profileLayer.scope.products is already the scope-specific overlay
      const scopeOverlay = profileLayer.scope.products as Record<string, unknown>;
      layers.push({
        label: 'profile-scope',
        value: scopeOverlay,
        source: profileLayer.scope.source,
      });
    }
  } else {
    layers.push({
      label: 'profile',
      value: {},
      source: 'profile:none',
    });
  }
  
  // 3. Preset defaults (resolve org preset if configured)
  let presetConfig = {};
  if (workspaceConfig?.data) {
    const workspaceData = workspaceConfig.data as Record<string, unknown>;
    if (workspaceData['$extends']) {
      try {
        const preset = await resolvePreset(workspaceData['$extends'] as string, cwd);
        presetConfig = getPresetConfigForProduct(preset, product);
        
        layers.push({
          label: 'preset',
          value: presetConfig,
          source: `preset:${workspaceData['$extends']}`,
        });
      } catch (error) {
        // Preset resolution failed, continue without preset
        console.warn(`Warning: Could not resolve preset ${workspaceData['$extends']}:`, error);
      }
    }
  }
  
  if (Object.keys(presetConfig).length === 0) {
    layers.push({
      label: 'preset',
      value: {},
      source: 'preset:none',
    });
  }
  
  // 4. Workspace config
  if (workspaceConfig?.data) {
    const workspaceData = (workspaceConfig.data as { products?: Record<string, unknown> })?.products?.[fsProduct] ?? {};
    layers.push({
      label: 'workspace',
      value: workspaceData,
      source: 'workspace:kb-labs.config',
    });
  }
  
  // 5. Local config (.kb/<product>/<product>.config.json)
  const localConfigPath = path.join(cwd, '.kb', fsProduct, `${fsProduct}.config.json`);
  try {
    const localConfig = await fsp.readFile(localConfigPath, 'utf-8');
    const localData = JSON.parse(localConfig);
    layers.push({
      label: 'local',
      value: localData,
      source: `local:.kb/${fsProduct}/${fsProduct}.config.json`,
    });
  } catch {
    // Local config is optional
  }
  
  // 6. CLI overrides
  if (Object.keys(cli).length > 0) {
    layers.push({
      label: 'cli',
      value: cli,
      source: 'cli:overrides',
    });
  }
  
  // Merge all layers
  const { merged, trace } = layeredMergeWithTrace(layers);
  
  // Validate against schema if provided
  if (schema) {
    // Schema validation will be implemented with AJV
    // For now, we'll skip validation
  }
  
  // Write final config if requested
  if (writeFinal) {
    await writeFinalConfig(cwd, fsProduct, merged);
  }
  
  // Update lockfile with config hash
  try {
    const configHash = computeConfigHash(merged);
     
    const configHashes: Record<string, unknown> = {};
    configHashes[product] = configHash;
    await updateLockfile(cwd, {
      configHashes
    });
  } catch (error) {
    // Lockfile update is optional, don't fail the config resolution
    console.warn('Warning: Could not update lockfile:', error);
  }
  
  return {
    config: merged as T,
    trace,
  };
}

/**
 * Explain product configuration (trace only)
 */
export async function explainProductConfig(
  opts: Omit<ResolveOptions, 'writeFinal'>,
  schema: unknown
): Promise<{ trace: import('../types').MergeTrace[] }> {
  const result = await getProductConfig(opts, schema);
  return { trace: result.trace };
}

/**
 * Get runtime defaults for a product
 */
function getRuntimeDefaults(product: string): Record<string, unknown> {
  const defaults: Record<string, Record<string, unknown>> = {
    devlink: {
      watch: true,
      build: true,
    },
    release: {
      registry: 'https://registry.npmjs.org',
      strategy: 'semver',
      bump: 'auto',
      strict: true,
      verify: ['audit', 'build', 'tests'],
      publish: { npm: true, github: false },
      rollback: { enabled: true, maxHistory: 5 },
      output: { json: true, md: true, text: true },
      changelog: {
        enabled: true,
        includeTypes: ['feat', 'fix', 'perf', 'refactor', 'revert'],
        excludeTypes: ['chore', 'ci'],
        ignoreAuthors: ['dependabot', 'renovate', 'github-actions[bot]', '*[bot]'],
        collapseMerges: true,
        collapseReverts: true,
        preferMergeSummary: true,
        bumpStrategy: 'independent',
        workspace: true,
        perPackage: true,
        format: 'both',
        level: 'standard',
        locale: 'en',
        cache: true,
        requireAudit: true,
        requireSignedTags: false,
        redactPatterns: ['(?i)token=\\w+', '(?i)apikey=\\w+', '(https?://[^\\s]+@[^\\s]+)', '(gh[ps]_[A-Za-z0-9_]+)'],
        maxBodyLength: 500,
        ignoreSubmodules: true,
      },
      git: {
        provider: 'auto',
        autoUnshallow: false,
      },
    },
    aiReview: {
      enabled: true,
      rules: [],
    },
    aiDocs: {
      enabled: true,
      templates: [],
    },
    devkit: {
      sync: true,
      check: true,
    },
    analytics: {
      enabled: true,
      sinks: [],
      buffer: {},
    },
  };
  
  return defaults[product] || {};
}

/**
 * Write final configuration to .kb/<product>/<product>.config.json
 */
async function writeFinalConfig(cwd: string, fsProduct: string, config: Record<string, unknown>): Promise<void> {
  const configDir = path.join(cwd, '.kb', fsProduct);
  const configPath = path.join(configDir, `${fsProduct}.config.json`);
  
  // Ensure directory exists
  await fsp.mkdir(configDir, { recursive: true });
  
  // Write config with schema version
  const finalConfig = {
    $schema: 'https://schemas.kb-labs.dev/config.schema.json',
    schemaVersion: '1.0',
    ...config,
  };
  
  await fsp.writeFile(configPath, JSON.stringify(finalConfig, null, 2));
}

/**
 * Get configuration hash for lockfile
 */
export function getConfigHash(config: unknown): string {
  return computeConfigHash(config);
}
