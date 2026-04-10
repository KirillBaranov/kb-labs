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
import { readMarketplaceLock, writeMarketplaceLock } from './marketplace-lock.js';
import { loadManifest } from './manifest-loader.js';
import { computePackageIntegrity } from './integrity.js';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface DiscoveryOptions {
  /** Workspace root directory (default: process.cwd()) */
  root?: string;
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
  private readonly importTimeoutMs: number;
  private readonly verifyIntegrity: boolean;

  constructor(opts: DiscoveryOptions = {}) {
    this.root = opts.root ?? process.cwd();
    this.importTimeoutMs = opts.importTimeoutMs ?? 5_000;
    this.verifyIntegrity = opts.verifyIntegrity ?? true;
  }

  /**
   * Run full discovery pipeline:
   *   1. Read .kb/marketplace.lock
   *   2. For each entry → resolve path → load manifest → validate → verify integrity
   *   3. Return aggregated result with diagnostics
   */
  async discover(): Promise<DiscoveryResult> {
    const diag = new DiagnosticCollector();
    const plugins: DiscoveredPlugin[] = [];
    const manifests = new Map<string, ManifestV3>();

    // 1. Read lock file
    const lock = await readMarketplaceLock(this.root, diag);
    if (!lock) {
      return { plugins, manifests, diagnostics: diag.getEvents() };
    }

    // 2. Process each entry
    const entries = Object.entries(lock.installed);
    for (const [packageId, entry] of entries) {
      await this.processEntry(packageId, entry, plugins, manifests, diag);
    }

    return { plugins, manifests, diagnostics: diag.getEvents() };
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private async processEntry(
    packageId: string,
    entry: MarketplaceEntry,
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

    // Resolve the package root (relative to workspace root)
    const packageRoot = path.resolve(this.root, entry.resolvedPath);

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

    // Verify integrity if enabled.
    // For local-linked packages (source: 'local'), package.json changes frequently
    // (devlink switches, version bumps) — auto-refresh the lock instead of blocking.
    if (this.verifyIntegrity && entry.integrity) {
      if (entry.source === 'local') {
        await this.refreshLocalIntegrity(packageRoot, packageId, entry, diag);
      } else {
        const ok = await this.checkIntegrity(packageRoot, entry.integrity, packageId, diag);
        if (!ok) {return;}
      }
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
   * For local-linked packages, silently refresh the integrity hash in the lock
   * if it has changed. Local packages change frequently (devlink, version bumps)
   * so blocking on mismatch would be a constant friction with no security benefit.
   */
  private async refreshLocalIntegrity(
    packageRoot: string,
    packageId: string,
    entry: MarketplaceEntry,
    diag: DiagnosticCollector,
  ): Promise<void> {
    try {
      const computed = await computePackageIntegrity(packageRoot);

      if (computed !== entry.integrity) {
        // Update the lock in place
        const lock = await readMarketplaceLock(this.root, diag);
        if (lock?.installed[packageId]) {
          lock.installed[packageId].integrity = computed;
          await writeMarketplaceLock(this.root, lock);
          diag.info('INTEGRITY_REFRESHED',
            `Local package "${packageId}" integrity refreshed in lock`, {
            pluginId: packageId,
          });
        }
      }
    } catch {
      // Non-blocking — if we can't refresh, proceed anyway
    }
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
