/**
 * @module @kb-labs/core-discovery/discovery-manager
 * Marketplace-based discovery: reads .kb/marketplace.lock, loads & validates manifests.
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { type ManifestV3 } from '@kb-labs/plugin-contracts';
import type {
  DiscoveryResult,
  DiscoveredPlugin,
  MarketplaceEntry,
  EntityKind,
} from './types.js';
import { DiagnosticCollector } from './diagnostics.js';
import { readMarketplaceLock } from './marketplace-lock.js';
import { loadManifest } from './manifest-loader.js';
import { computePackageIntegrity } from './integrity.js';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface DiscoveryOptions {
  /** Workspace root directory (default: process.cwd()) */
  root?: string;
  /**
   * Platform installation root (e.g. ~/kb-platform).
   * When set and different from root, both lock files are read:
   * project lock wins, platform lock fills gaps.
   */
  platformRoot?: string;
  /** Timeout for each manifest import in milliseconds (default: 5000) */
  importTimeoutMs?: number;
  /** Whether to verify integrity hashes (default: true) */
  verifyIntegrity?: boolean;
}

// ---------------------------------------------------------------------------
// Discovery Manager
// ---------------------------------------------------------------------------

/**
 * Discovers installed entities by reading the marketplace lock file
 * and loading manifests from the resolved paths.
 *
 * There is no filesystem scanning — every entity must be registered
 * in .kb/marketplace.lock via `kb marketplace install` or `kb marketplace link`.
 */
export class DiscoveryManager {
  private readonly root: string;
  private readonly platformRoot: string | undefined;
  private readonly importTimeoutMs: number;
  private readonly verifyIntegrity: boolean;

  constructor(opts: DiscoveryOptions = {}) {
    this.root = opts.root ?? process.cwd();
    this.platformRoot = opts.platformRoot !== this.root ? opts.platformRoot : undefined;
    this.importTimeoutMs = opts.importTimeoutMs ?? 5_000;
    this.verifyIntegrity = opts.verifyIntegrity ?? true;
  }

  /**
   * Run full discovery pipeline.
   *
   * When platformRoot is set, both lock files are merged:
   * project lock (this.root) is read first and wins on conflicts.
   * Platform lock fills in any entries not present in the project.
   *
   *   1. Read .kb/marketplace.lock (project first, then platform)
   *   2. For each entry → resolve path → load manifest → validate → verify integrity
   *   3. Return aggregated result with diagnostics
   */
  async discover(): Promise<DiscoveryResult> {
    const diag = new DiagnosticCollector();
    const plugins: DiscoveredPlugin[] = [];
    const manifests = new Map<string, ManifestV3>();

    // 1. Build merged entry map: project wins, platform fills gaps
    const mergedEntries = await this.readMergedLock(diag);
    if (!mergedEntries) {
      return { plugins, manifests, diagnostics: diag.getEvents() };
    }

    // 2. Process each entry
    for (const [packageId, { entry, root }] of mergedEntries) {
      await this.processEntry(packageId, entry, root, plugins, manifests, diag);
    }

    return { plugins, manifests, diagnostics: diag.getEvents() };
  }

  /**
   * Read and merge marketplace.lock from project root and (optionally) platform root.
   * Returns a map of packageId → { entry, root } where root is the directory
   * the entry's resolvedPath should be resolved against.
   * Project entries win over platform entries on conflict.
   */
  private async readMergedLock(
    diag: DiagnosticCollector,
  ): Promise<Map<string, { entry: MarketplaceEntry; root: string }> | null> {
    const merged = new Map<string, { entry: MarketplaceEntry; root: string }>();

    // Platform lock first (lower priority — fills gaps)
    if (this.platformRoot) {
      const platformLock = await readMarketplaceLock(this.platformRoot, diag);
      if (platformLock) {
        for (const [packageId, entry] of Object.entries(platformLock.installed)) {
          merged.set(packageId, { entry, root: this.platformRoot });
        }
      }
    }

    // Project lock second (higher priority — overwrites platform entries)
    const projectLock = await readMarketplaceLock(this.root, diag);
    if (projectLock) {
      for (const [packageId, entry] of Object.entries(projectLock.installed)) {
        merged.set(packageId, { entry, root: this.root });
      }
    } else if (!this.platformRoot) {
      // No project lock and no platform lock — nothing to discover
      return null;
    }

    return merged.size > 0 ? merged : null;
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private async processEntry(
    packageId: string,
    entry: MarketplaceEntry,
    root: string,
    plugins: DiscoveredPlugin[],
    manifests: Map<string, ManifestV3>,
    diag: DiagnosticCollector,
  ): Promise<void> {
    // Skip disabled entries
    if (entry.enabled === false) {
      diag.info('PLUGIN_DISABLED', `Plugin "${packageId}" is disabled — skipping`, {
        pluginId: packageId,
      });
      return;
    }

    // Resolve the package root relative to the lock file's root directory
    const packageRoot = path.resolve(root, entry.resolvedPath);

    // Check the package directory exists
    try {
      await fs.access(packageRoot);
    } catch {
      diag.error('PACKAGE_NOT_FOUND', `Package directory not found: ${packageRoot}`, {
        pluginId: packageId,
        filePath: packageRoot,
        remediation: `Run "pnpm install" or "kb marketplace install ${packageId}" to restore`,
      });
      return;
    }

    // Verify integrity for non-local packages. Local packages change frequently
    // (rebuilds, version bumps) — integrity is updated at install/sync time, not here.
    if (this.verifyIntegrity && entry.integrity && entry.source !== 'local') {
      const ok = await this.checkIntegrity(packageRoot, entry.integrity, packageId, diag);
      if (!ok) {return;}
    }

    // Load manifest
    const manifest = await loadManifest(packageRoot, diag, this.importTimeoutMs);
    if (!manifest) {return;}

    // Validate manifest ID matches expected package ID
    if (manifest.id !== packageId) {
      diag.warning('MANIFEST_VALIDATION_ERROR',
        `Manifest ID "${manifest.id}" does not match lock entry "${packageId}"`, {
        pluginId: packageId,
        filePath: packageRoot,
      });
      // Continue anyway — use the manifest's own ID
    }

    const pluginId = manifest.id;

    // Check for duplicate
    if (manifests.has(pluginId)) {
      diag.warning('ENTITY_CONFLICT', `Duplicate plugin ID "${pluginId}" — skipping later entry`, {
        pluginId,
        filePath: packageRoot,
      });
      return;
    }

    // Extract entity kinds this plugin provides
    const provides = extractEntityKinds(manifest);

    // Signature check (info-level, not blocking)
    if (!entry.signature) {
      diag.info('SIGNATURE_MISSING', `Plugin "${pluginId}" is not signed`, {
        pluginId,
        remediation: 'Publish through the official marketplace to get a platform signature',
      });
    }

    manifests.set(pluginId, manifest);
    plugins.push({
      id: pluginId,
      version: manifest.version,
      packageRoot,
      source: { kind: entry.source, path: entry.resolvedPath },
      display: manifest.display
        ? { name: manifest.display.name, description: manifest.display.description }
        : undefined,
      integrity: entry.integrity,
      signature: entry.signature,
      provides,
    });
  }

  /**
   * Verify the SRI integrity hash of a package by hashing its package.json.
   */
  private async checkIntegrity(
    packageRoot: string,
    expected: string,
    pluginId: string,
    diag: DiagnosticCollector,
  ): Promise<boolean> {
    try {
      const computed = await computePackageIntegrity(packageRoot);

      if (computed !== expected) {
        diag.error('INTEGRITY_MISMATCH',
          `Integrity mismatch for "${pluginId}": expected ${expected}, got ${computed}`, {
          pluginId,
          filePath: path.join(packageRoot, 'package.json'),
          remediation: `Re-install: kb marketplace install ${pluginId}`,
        });
        return false;
      }
      return true;
    } catch (err) {
      diag.warning('INTEGRITY_MISMATCH',
        `Could not verify integrity for "${pluginId}": ${(err as Error).message}`, {
        pluginId,
        filePath: packageRoot,
      });
      // Non-blocking — proceed without integrity verification
      return true;
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract which entity kinds a manifest provides by inspecting its sections.
 */
export function extractEntityKinds(manifest: ManifestV3): EntityKind[] {
  const kinds: EntityKind[] = ['plugin']; // Every manifest is at least a plugin

  if (manifest.cli?.commands?.length)               {kinds.push('cli-command');}
  if (manifest.rest?.routes?.length)                 {kinds.push('rest-route');}
  if (manifest.ws?.channels?.length)                 {kinds.push('ws-channel');}
  if (manifest.workflows?.handlers?.length)          {kinds.push('workflow');}
  if (manifest.webhooks?.handlers?.length)           {kinds.push('webhook');}
  if (manifest.jobs?.handlers?.length)               {kinds.push('job');}
  if (manifest.cron?.schedules?.length)              {kinds.push('cron');}
  if (manifest.studio?.pages?.length)                {kinds.push('studio-widget');}
  if (manifest.studio?.menus?.length)                {kinds.push('studio-menu');}

  return kinds;
}
