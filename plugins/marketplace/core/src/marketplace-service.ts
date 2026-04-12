/**
 * @module @kb-labs/marketplace-core/marketplace-service
 * Unified marketplace service — install/uninstall/enable/disable for all entity types.
 * Works through PackageSource abstraction — never calls pnpm directly.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { glob } from 'glob';
import type { EntityKind, MarketplaceEntry, MarketplaceLock } from '@kb-labs/core-discovery';
import {
  readMarketplaceLock,
  writeMarketplaceLock,
  createEmptyLock,
  createMarketplaceEntry,
  addToMarketplaceLock,
  removeFromMarketplaceLock,
  enablePlugin,
  disablePlugin,
  DiagnosticCollector,
  loadManifest,
} from '@kb-labs/core-discovery';
import type {
  PackageSource,
  EntityKindStrategy,
  MarketplaceServiceAPI,
  MarketplaceEntryWithId,
  InstallResult,
  InstallResultEntry,
  SyncResult,
  DoctorReport,
  DoctorIssue,
} from '@kb-labs/marketplace-contracts';
import { setCacheEntry, removeCacheEntry } from './manifest-cache.js';
import { PluginStrategy } from './strategies/plugin-strategy.js';
import { AdapterStrategy } from './strategies/adapter-strategy.js';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface MarketplaceServiceOptions {
  /** Workspace root directory */
  root: string;
  /** Package source (npm, registry, etc.) */
  source: PackageSource;
  /** Additional strategies beyond built-in plugin/adapter */
  strategies?: EntityKindStrategy[];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class MarketplaceService implements MarketplaceServiceAPI {
  private readonly root: string;
  private readonly source: PackageSource;
  private readonly strategies = new Map<EntityKind, EntityKindStrategy>();

  constructor(opts: MarketplaceServiceOptions) {
    this.root = opts.root;
    this.source = opts.source;

    // Built-in strategies
    this.registerStrategy(new PluginStrategy());
    this.registerStrategy(new AdapterStrategy());

    // User-supplied strategies
    if (opts.strategies) {
      for (const s of opts.strategies) {
        this.registerStrategy(s);
      }
    }
  }

  registerStrategy(strategy: EntityKindStrategy): void {
    this.strategies.set(strategy.kind, strategy);
  }

  // -------------------------------------------------------------------------
  // Install
  // -------------------------------------------------------------------------

  async install(specs: string[], opts?: { dev?: boolean }): Promise<InstallResult> {
    const installed: InstallResultEntry[] = [];
    const warnings: string[] = [];

    for (const spec of specs) {
      const resolved = await this.source.resolve(spec);
      const result = await this.source.install(resolved, this.root, opts);

      // Detect primary kind via strategies
      const primaryKind = await this.detectKind(result.packageRoot);
      const strategy = this.strategies.get(primaryKind);
      const provides = strategy
        ? await strategy.extractProvides(result.packageRoot)
        : [primaryKind];

      // Write to marketplace.lock
      const entry = createMarketplaceEntry({
        version: result.version,
        integrity: result.integrity,
        resolvedPath: relativeToRoot(this.root, result.packageRoot),
        source: resolved.source,
        primaryKind,
        provides,
      });

      await addToMarketplaceLock(this.root, result.id, entry);

      // Cache manifest
      await this.cacheManifest(result.id, result.packageRoot, primaryKind, result.integrity);

      // Run post-install hook
      if (strategy?.afterInstall) {
        try {
          await strategy.afterInstall(result.id, result.packageRoot, this);
        } catch (err) {
          warnings.push(`afterInstall for ${result.id}: ${(err as Error).message}`);
        }
      }

      installed.push({
        id: result.id,
        version: result.version,
        primaryKind,
        provides,
        packageRoot: result.packageRoot,
      });
    }

    return { installed, warnings };
  }

  // -------------------------------------------------------------------------
  // Uninstall
  // -------------------------------------------------------------------------

  async uninstall(packageIds: string[]): Promise<void> {
    for (const id of packageIds) {
      // Run pre-uninstall hook
      const entry = await this.getEntry(id);
      if (entry) {
        const strategy = this.strategies.get(entry.primaryKind);
        if (strategy?.beforeUninstall) {
          await strategy.beforeUninstall(id, this);
        }
      }

      // Remove from lock
      await removeFromMarketplaceLock(this.root, id);

      // Remove from manifest cache
      await removeCacheEntry(this.root, id);

      // Remove from disk
      await this.source.remove(id, this.root);
    }
  }

  // -------------------------------------------------------------------------
  // Link / Unlink
  // -------------------------------------------------------------------------

  async link(packagePath: string): Promise<InstallResultEntry> {
    const absPath = path.resolve(this.root, packagePath);

    // Path traversal guard — linked path must be within workspace root
    if (!absPath.startsWith(this.root)) {
      throw new Error(`Path "${packagePath}" is outside workspace root — refusing to link`);
    }

    const pkgJson = JSON.parse(
      await fs.readFile(
        path.join(absPath, 'package.json'), 'utf-8',
      ),
    );
    const id: string = pkgJson.name;
    const version: string = pkgJson.version ?? '0.0.0';

    const primaryKind = await this.detectKind(absPath);
    const strategy = this.strategies.get(primaryKind);
    const provides = strategy
      ? await strategy.extractProvides(absPath)
      : [primaryKind];

    const integrity = await computeIntegrity(absPath);

    const entry = createMarketplaceEntry({
      version,
      integrity,
      resolvedPath: relativeToRoot(this.root, absPath),
      source: 'local',
      primaryKind,
      provides,
    });

    await addToMarketplaceLock(this.root, id, entry);
    await this.cacheManifest(id, absPath, primaryKind, integrity);

    if (strategy?.afterInstall) {
      await strategy.afterInstall(id, absPath, this);
    }

    return { id, version, primaryKind, provides, packageRoot: absPath };
  }

  async unlink(packageId: string): Promise<void> {
    await removeFromMarketplaceLock(this.root, packageId);
    await removeCacheEntry(this.root, packageId);
  }

  // -------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------

  async update(packageIds?: string[]): Promise<InstallResult> {
    const diag = new DiagnosticCollector();
    const lock = await readMarketplaceLock(this.root, diag);
    if (!lock) {return { installed: [], warnings: ['No marketplace.lock found'] };}

    const ids = packageIds ?? Object.keys(lock.installed);
    const specs = ids.filter(id => id in lock.installed);

    // Re-install at latest
    return this.install(specs);
  }

  // -------------------------------------------------------------------------
  // Enable / Disable
  // -------------------------------------------------------------------------

  async enable(packageId: string): Promise<void> {
    const ok = await enablePlugin(this.root, packageId);
    if (!ok) {
      throw new Error(`Package "${packageId}" not found in marketplace.lock`);
    }
  }

  async disable(packageId: string): Promise<void> {
    const ok = await disablePlugin(this.root, packageId);
    if (!ok) {
      throw new Error(`Package "${packageId}" not found in marketplace.lock`);
    }
  }

  // -------------------------------------------------------------------------
  // List / GetEntry (MarketplaceServiceAPI)
  // -------------------------------------------------------------------------

  async list(filter?: { kind?: EntityKind }): Promise<MarketplaceEntryWithId[]> {
    const diag = new DiagnosticCollector();
    const lock = await readMarketplaceLock(this.root, diag);
    if (!lock) {return [];}

    let entries = Object.entries(lock.installed).map(([id, entry]) => ({ ...entry, id }));
    if (filter?.kind) {
      entries = entries.filter(e => e.primaryKind === filter.kind);
    }
    return entries;
  }

  async getEntry(packageId: string): Promise<MarketplaceEntry | null> {
    const diag = new DiagnosticCollector();
    const lock = await readMarketplaceLock(this.root, diag);
    return lock?.installed[packageId] ?? null;
  }

  // -------------------------------------------------------------------------
  // Sync (scan workspace → populate lock from config-driven globs)
  // -------------------------------------------------------------------------

  /**
   * Scan workspace for plugins and adapters using glob patterns.
   * Existing entries are preserved (not overwritten).
   * Patterns come from kb.config.json marketplace.sync.include.
   */
  async sync(opts: {
    include: string[];
    exclude?: string[];
    autoEnable?: boolean;
  }): Promise<SyncResult> {
    const autoEnable = opts.autoEnable ?? false;
    const diag = new DiagnosticCollector();
    const lock = await readMarketplaceLock(this.root, diag) ?? createEmptyLock();
    const existingIds = new Set(Object.keys(lock.installed));

    const added: SyncResult['added'] = [];
    const skipped: SyncResult['skipped'] = [];

    // Resolve glob patterns to package directories
    const includePatterns = opts.include.map(p => path.join(p, 'package.json'));
    const excludePatterns = opts.exclude ?? [];

    const packageJsonPaths = await glob(includePatterns, {
      cwd: this.root,
      ignore: excludePatterns,
      absolute: false,
    });

    for (const relPkgJson of packageJsonPaths) {
      const pkgDir = path.resolve(this.root, path.dirname(relPkgJson));
      await this._syncPackage(pkgDir, relPkgJson, existingIds, autoEnable, lock, added, skipped);
    }

    await writeMarketplaceLock(this.root, lock);

    return { added, skipped, total: Object.keys(lock.installed).length };
  }

  private async _syncPackage(
    pkgDir: string,
    _relPkgJson: string,
    existingIds: Set<string>,
    autoEnable: boolean,
    lock: MarketplaceLock,
    added: SyncResult['added'],
    skipped: SyncResult['skipped'],
  ): Promise<void> {
    let pkgName: string;
    let pkgVersion: string;
    try {
      const pkgJson = JSON.parse(await fs.readFile(path.join(pkgDir, 'package.json'), 'utf-8'));
      pkgName = pkgJson.name;
      pkgVersion = pkgJson.version ?? '0.0.0';
      if (!pkgName) { return; }
    } catch {
      return;
    }

    if (existingIds.has(pkgName)) {
      skipped.push({ id: pkgName, reason: 'already in lock' });
      return;
    }

    let detected = false;
    for (const strategy of this.strategies.values()) {
      const kind = await strategy.detectKind(pkgDir);
      if (kind) { detected = true; break; }
    }
    if (!detected) { return; }

    const primaryKind = await this.detectKind(pkgDir);
    const strategy = this.strategies.get(primaryKind);
    const provides = strategy ? await strategy.extractProvides(pkgDir) : [primaryKind];
    const integrity = await computeIntegrity(pkgDir);

    // Use manifest ID as lock key if the strategy can resolve it.
    // This keeps discovery working even when package.json name differs from manifest.id
    // (e.g. after folder renames like cli/ → entry/).
    const resolvedId = (strategy?.resolveId ? await strategy.resolveId(pkgDir) : null) ?? pkgName;

    if (existingIds.has(resolvedId) && resolvedId !== pkgName) {
      skipped.push({ id: resolvedId, reason: 'already in lock' });
      return;
    }

    const entry = createMarketplaceEntry({
      version: pkgVersion,
      integrity,
      resolvedPath: relativeToRoot(this.root, pkgDir),
      source: 'local',
      primaryKind,
      provides,
    });

    if (!autoEnable) { entry.enabled = false; }

    lock.installed[resolvedId] = entry;
    added.push({ id: resolvedId, primaryKind, version: pkgVersion });
  }

  // -------------------------------------------------------------------------
  // Doctor
  // -------------------------------------------------------------------------

  async doctor(): Promise<DoctorReport> {
    const diag = new DiagnosticCollector();
    const lock = await readMarketplaceLock(this.root, diag);
    const issues: DoctorIssue[] = [];

    if (!lock) {
      return { ok: true, total: 0, issues: [{ severity: 'info', packageId: '', message: 'No marketplace.lock found' }] };
    }

    const entries = Object.entries(lock.installed);

    for (const [id, entry] of entries) {
      const pkgRoot = path.resolve(this.root, entry.resolvedPath);

      // Check package exists
      try {
        await fs.access(pkgRoot);
      } catch {
        issues.push({
          severity: 'error',
          packageId: id,
          message: `Package directory not found: ${pkgRoot}`,
          remediation: `Run "kb marketplace install ${id}" to restore`,
        });
        continue;
      }

      // Check integrity
      if (entry.integrity) {
        const computed = await computeIntegrity(pkgRoot);
        if (computed && computed !== entry.integrity) {
          issues.push({
            severity: 'warning',
            packageId: id,
            message: `Integrity mismatch: expected ${entry.integrity}, got ${computed}`,
            remediation: `Re-install: kb marketplace install ${id}`,
          });
        }
      }

      // Check signature
      if (!entry.signature) {
        issues.push({
          severity: 'info',
          packageId: id,
          message: 'Package is not signed',
          remediation: 'Publish through the official marketplace to get a platform signature',
        });
      }
    }

    return {
      ok: issues.filter(i => i.severity === 'error').length === 0,
      total: entries.length,
      issues,
    };
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private async detectKind(packageRoot: string): Promise<EntityKind> {
    // Try each strategy in registration order
    for (const strategy of this.strategies.values()) {
      const kind = await strategy.detectKind(packageRoot);
      if (kind) {return kind;}
    }
    // Default: plugin
    return 'plugin';
  }

  private async cacheManifest(
    packageId: string,
    packageRoot: string,
    primaryKind: EntityKind,
    integrity: string,
  ): Promise<void> {
    try {
      if (primaryKind === 'plugin') {
        const diag = new DiagnosticCollector();
        const manifest = await loadManifest(packageRoot, diag);
        if (manifest) {
          await setCacheEntry(this.root, packageId, {
            manifestType: 'plugin',
            manifest,
            cachedAt: new Date().toISOString(),
            integrity,
          });
        }
      } else if (primaryKind === 'adapter') {
        const distPath = path.join(packageRoot, 'dist', 'index.js');
        const mod = await import(pathToFileURL(distPath).href);
        if (mod.manifest) {
          await setCacheEntry(this.root, packageId, {
            manifestType: 'adapter',
            manifest: mod.manifest,
            cachedAt: new Date().toISOString(),
            integrity,
          });
        }
      }
    } catch (err) {
      // Non-fatal — cache miss means slower next discovery, but log for diagnostics
      console.warn(`[marketplace] Failed to cache manifest for "${packageId}": ${(err as Error).message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeToRoot(root: string, absPath: string): string {
  const rel = path.relative(root, absPath);
  return rel.startsWith('.') ? rel : `./${rel}`;
}

async function computeIntegrity(packageRoot: string): Promise<string> {
  try {
    const content = await fs.readFile(path.join(packageRoot, 'package.json'));
    return `sha256-${crypto.createHash('sha256').update(content).digest('base64')}`;
  } catch {
    return '';
  }
}
