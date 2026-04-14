/**
 * @module @kb-labs/marketplace-core/marketplace-service
 * Unified marketplace service — install/uninstall/enable/disable for all entity types.
 *
 * Every mutating method is explicitly scope-bound (`platform` or `project`).
 * There is no implicit default: callers pass a `ScopeContext` per call so
 * the service can target the right `.kb/marketplace.lock`.
 *
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
  ScopedMarketplaceEntry,
  ScopeContext,
  QueryScopeContext,
  MarketplaceScope,
  MarketplaceDiagnostic,
  InstallResult,
  InstallResultEntry,
  SyncResult,
  DoctorReport,
  DoctorIssue,
} from '@kb-labs/marketplace-contracts';
import { setCacheEntry, removeCacheEntry } from './manifest-cache.js';
import { PluginStrategy } from './strategies/plugin-strategy.js';
import { AdapterStrategy } from './strategies/adapter-strategy.js';
import { resolveScopeRoot, resolveQueryRoots, type ServiceRoots } from './scope.js';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface MarketplaceServiceOptions {
  /** Platform workspace root — always required. Used for `scope: 'platform'`. */
  platformRoot: string;
  /**
   * Default project root. Optional — a daemon serving multiple projects can
   * leave this unset and pass `ctx.projectRoot` per call. When both are
   * provided, per-call `ctx.projectRoot` wins.
   */
  projectRoot?: string;
  /** Package source (npm, registry, etc.) */
  source: PackageSource;
  /** Additional strategies beyond built-in plugin/adapter */
  strategies?: EntityKindStrategy[];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class MarketplaceService implements MarketplaceServiceAPI {
  private readonly roots: ServiceRoots;
  private readonly source: PackageSource;
  private readonly strategies = new Map<EntityKind, EntityKindStrategy>();

  constructor(opts: MarketplaceServiceOptions) {
    this.roots = { platformRoot: opts.platformRoot, projectRoot: opts.projectRoot };
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

  async install(
    ctx: ScopeContext,
    specs: string[],
    opts?: { dev?: boolean },
  ): Promise<InstallResult> {
    const scopeRoot = resolveScopeRoot(this.roots, ctx);
    const installed: InstallResultEntry[] = [];
    const warnings: string[] = [];
    const diagnostics: MarketplaceDiagnostic[] = [];

    for (const spec of specs) {
      const resolved = await this.source.resolve(spec);
      const result = await this.source.install(resolved, scopeRoot, opts);

      // Detect primary kind via strategies
      const primaryKind = await this.detectKind(result.packageRoot);
      this.assertScopeAllowsKind(ctx.scope, primaryKind);

      const strategy = this.strategies.get(primaryKind);
      const provides = strategy
        ? await strategy.extractProvides(result.packageRoot)
        : [primaryKind];

      // Write to marketplace.lock
      const entry = createMarketplaceEntry({
        version: result.version,
        integrity: result.integrity,
        resolvedPath: relativeToRoot(scopeRoot, result.packageRoot),
        source: resolved.source,
        primaryKind,
        provides,
      });

      await addToMarketplaceLock(scopeRoot, result.id, entry);

      // Cache manifest
      await this.cacheManifest(scopeRoot, result.id, result.packageRoot, primaryKind, result.integrity);

      // Run post-install hook
      if (strategy?.afterInstall) {
        try {
          await strategy.afterInstall(result.id, result.packageRoot, this, ctx);
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
        scope: ctx.scope,
      });
    }

    return { installed, warnings, scope: ctx.scope, diagnostics: diagnostics.length ? diagnostics : undefined };
  }

  // -------------------------------------------------------------------------
  // Uninstall
  // -------------------------------------------------------------------------

  async uninstall(ctx: ScopeContext, packageIds: string[]): Promise<void> {
    const scopeRoot = resolveScopeRoot(this.roots, ctx);
    for (const id of packageIds) {
      // Run pre-uninstall hook
      const entry = await this.getEntry(ctx, id);
      if (entry) {
        const strategy = this.strategies.get(entry.primaryKind);
        if (strategy?.beforeUninstall) {
          await strategy.beforeUninstall(id, this, ctx);
        }
      }

      await removeFromMarketplaceLock(scopeRoot, id);
      await removeCacheEntry(scopeRoot, id);
      await this.source.remove(id, scopeRoot);
    }
  }

  // -------------------------------------------------------------------------
  // Link / Unlink
  // -------------------------------------------------------------------------

  async link(ctx: ScopeContext, packagePath: string): Promise<InstallResultEntry> {
    const scopeRoot = resolveScopeRoot(this.roots, ctx);
    const absPath = path.resolve(scopeRoot, packagePath);

    // Path traversal guard — linked path must be within the scope root.
    if (!isPathInside(scopeRoot, absPath)) {
      throw new Error(
        `Path "${packagePath}" is outside ${ctx.scope} root "${scopeRoot}" — refusing to link`,
      );
    }

    const pkgJson = JSON.parse(
      await fs.readFile(path.join(absPath, 'package.json'), 'utf-8'),
    );
    const id: string = pkgJson.name;
    const version: string = pkgJson.version ?? '0.0.0';

    const primaryKind = await this.detectKind(absPath);
    this.assertScopeAllowsKind(ctx.scope, primaryKind);

    const strategy = this.strategies.get(primaryKind);
    const provides = strategy
      ? await strategy.extractProvides(absPath)
      : [primaryKind];

    const integrity = await computeIntegrity(absPath);

    const entry = createMarketplaceEntry({
      version,
      integrity,
      resolvedPath: relativeToRoot(scopeRoot, absPath),
      source: 'local',
      primaryKind,
      provides,
    });

    await addToMarketplaceLock(scopeRoot, id, entry);
    await this.cacheManifest(scopeRoot, id, absPath, primaryKind, integrity);

    if (strategy?.afterInstall) {
      await strategy.afterInstall(id, absPath, this, ctx);
    }

    return { id, version, primaryKind, provides, packageRoot: absPath, scope: ctx.scope };
  }

  async unlink(ctx: ScopeContext, packageId: string): Promise<void> {
    const scopeRoot = resolveScopeRoot(this.roots, ctx);
    await removeFromMarketplaceLock(scopeRoot, packageId);
    await removeCacheEntry(scopeRoot, packageId);
  }

  // -------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------

  async update(ctx: ScopeContext, packageIds?: string[]): Promise<InstallResult> {
    const scopeRoot = resolveScopeRoot(this.roots, ctx);
    const diag = new DiagnosticCollector();
    const lock = await readMarketplaceLock(scopeRoot, diag);
    if (!lock) {
      return { installed: [], warnings: ['No marketplace.lock found'], scope: ctx.scope };
    }

    const ids = packageIds ?? Object.keys(lock.installed);
    const specs = ids.filter(id => id in lock.installed);

    return this.install(ctx, specs);
  }

  // -------------------------------------------------------------------------
  // Enable / Disable
  // -------------------------------------------------------------------------

  async enable(ctx: ScopeContext, packageId: string): Promise<void> {
    const scopeRoot = resolveScopeRoot(this.roots, ctx);
    const ok = await enablePlugin(scopeRoot, packageId);
    if (!ok) {
      throw new Error(`Package "${packageId}" not found in ${ctx.scope} marketplace.lock`);
    }
  }

  async disable(ctx: ScopeContext, packageId: string): Promise<void> {
    const scopeRoot = resolveScopeRoot(this.roots, ctx);
    const ok = await disablePlugin(scopeRoot, packageId);
    if (!ok) {
      throw new Error(`Package "${packageId}" not found in ${ctx.scope} marketplace.lock`);
    }
  }

  // -------------------------------------------------------------------------
  // List / GetEntry (MarketplaceServiceAPI)
  // -------------------------------------------------------------------------

  async list(
    ctx: QueryScopeContext,
    filter?: { kind?: EntityKind },
  ): Promise<ScopedMarketplaceEntry[]> {
    const targets = resolveQueryRoots(this.roots, ctx);

    // Collect per-scope entries. For 'all' we later apply platform-wins.
    const perScope: Array<{ scope: MarketplaceScope; entries: MarketplaceEntryWithId[] }> = [];
    for (const { scope, root } of targets) {
      const diag = new DiagnosticCollector();
      const lock = await readMarketplaceLock(root, diag);
      if (!lock) {
        perScope.push({ scope, entries: [] });
        continue;
      }
      const entries = Object.entries(lock.installed).map(([id, entry]) => ({ ...entry, id }));
      perScope.push({ scope, entries });
    }

    const merged = mergeScopedEntries(perScope);
    const filtered = filter?.kind
      ? merged.entries.filter(e => e.primaryKind === filter.kind)
      : merged.entries;
    return filtered;
  }

  async getEntry(ctx: ScopeContext, packageId: string): Promise<MarketplaceEntry | null> {
    const scopeRoot = resolveScopeRoot(this.roots, ctx);
    const diag = new DiagnosticCollector();
    const lock = await readMarketplaceLock(scopeRoot, diag);
    return lock?.installed[packageId] ?? null;
  }

  // -------------------------------------------------------------------------
  // Sync (scan workspace → populate lock from config-driven globs)
  // -------------------------------------------------------------------------

  /**
   * Scan workspace for plugins and adapters using glob patterns.
   * Existing entries are preserved (not overwritten).
   * Patterns come from kb.config.json marketplace.sync.include.
   *
   * Sync is scope-bound: globs resolve against the scope root and results go
   * into that scope's lock. Adapter discovery in `project` scope is refused
   * with a clear error to preserve the adapters-are-platform-only invariant.
   */
  async sync(
    ctx: ScopeContext,
    opts: {
      include: string[];
      exclude?: string[];
      autoEnable?: boolean;
    },
  ): Promise<SyncResult> {
    const scopeRoot = resolveScopeRoot(this.roots, ctx);
    const autoEnable = opts.autoEnable ?? false;
    const diag = new DiagnosticCollector();
    const lock = await readMarketplaceLock(scopeRoot, diag) ?? createEmptyLock();
    const existingIds = new Set(Object.keys(lock.installed));

    const added: SyncResult['added'] = [];
    const skipped: SyncResult['skipped'] = [];

    const includePatterns = opts.include.map(p => path.join(p, 'package.json'));
    const excludePatterns = opts.exclude ?? [];

    const packageJsonPaths = await glob(includePatterns, {
      cwd: scopeRoot,
      ignore: excludePatterns,
      absolute: false,
    });

    for (const relPkgJson of packageJsonPaths) {
      const pkgDir = path.resolve(scopeRoot, path.dirname(relPkgJson));
      await this._syncPackage(ctx.scope, scopeRoot, pkgDir, relPkgJson, existingIds, autoEnable, lock, added, skipped);
    }

    await writeMarketplaceLock(scopeRoot, lock);

    return { added, skipped, total: Object.keys(lock.installed).length };
  }

  private async _syncPackage(
    scope: MarketplaceScope,
    scopeRoot: string,
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

    // Adapters can only live in platform scope.
    if (scope === 'project' && primaryKind === 'adapter') {
      skipped.push({ id: pkgName, reason: 'adapter not allowed in project scope' });
      return;
    }

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
      resolvedPath: relativeToRoot(scopeRoot, pkgDir),
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

  async doctor(ctx: ScopeContext): Promise<DoctorReport> {
    const scopeRoot = resolveScopeRoot(this.roots, ctx);
    const diag = new DiagnosticCollector();
    const lock = await readMarketplaceLock(scopeRoot, diag);
    const issues: DoctorIssue[] = [];

    if (!lock) {
      return { ok: true, total: 0, issues: [{ severity: 'info', packageId: '', message: 'No marketplace.lock found' }] };
    }

    const entries = Object.entries(lock.installed);

    for (const [id, entry] of entries) {
      const pkgRoot = path.resolve(scopeRoot, entry.resolvedPath);

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
    for (const strategy of this.strategies.values()) {
      const kind = await strategy.detectKind(packageRoot);
      if (kind) { return kind; }
    }
    return 'plugin';
  }

  /**
   * Hard guard: adapters may only be installed/linked in platform scope.
   * Lives in one place so adapter-scope policy is not duplicated across
   * `link`, `install`, and `sync`.
   */
  private assertScopeAllowsKind(scope: MarketplaceScope, kind: EntityKind): void {
    if (scope === 'project' && kind === 'adapter') {
      throw new AdapterScopeError(
        'Adapters can only be installed in platform scope. ' +
        'Use --scope platform or install globally via the platform marketplace.',
      );
    }
  }

  private async cacheManifest(
    scopeRoot: string,
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
          await setCacheEntry(scopeRoot, packageId, {
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
          await setCacheEntry(scopeRoot, packageId, {
            manifestType: 'adapter',
            manifest: mod.manifest,
            cachedAt: new Date().toISOString(),
            integrity,
          });
        }
      }
    } catch (err) {
      console.warn(`[marketplace] Failed to cache manifest for "${packageId}": ${(err as Error).message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class AdapterScopeError extends Error {
  readonly code = 'MARKETPLACE_ADAPTER_PROJECT_SCOPE';
  constructor(message: string) {
    super(message);
    this.name = 'AdapterScopeError';
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeToRoot(root: string, absPath: string): string {
  const rel = path.relative(root, absPath);
  return rel.startsWith('.') ? rel : `./${rel}`;
}

function isPathInside(parent: string, child: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

async function computeIntegrity(packageRoot: string): Promise<string> {
  try {
    const content = await fs.readFile(path.join(packageRoot, 'package.json'));
    return `sha256-${crypto.createHash('sha256').update(content).digest('base64')}`;
  } catch {
    return '';
  }
}

/**
 * Merge per-scope entries with platform-wins precedence.
 *
 * For a given package id present in both platform and project, the platform
 * entry is kept and a diagnostic is emitted so the caller can surface the
 * conflict.
 */
export function mergeScopedEntries(
  perScope: Array<{ scope: MarketplaceScope; entries: MarketplaceEntryWithId[] }>,
): { entries: ScopedMarketplaceEntry[]; diagnostics: MarketplaceDiagnostic[] } {
  const out = new Map<string, ScopedMarketplaceEntry>();
  const diagnostics: MarketplaceDiagnostic[] = [];

  // Process platform first so platform entries land first and project
  // duplicates are rejected with a diagnostic.
  const ordered = [...perScope].sort((a, b) => {
    if (a.scope === b.scope) { return 0; }
    return a.scope === 'platform' ? -1 : 1;
  });

  for (const { scope, entries } of ordered) {
    for (const e of entries) {
      const existing = out.get(e.id);
      if (existing) {
        // platform-wins: ignore subsequent duplicates, emit a diagnostic.
        diagnostics.push({
          code: 'MARKETPLACE_SCOPE_COLLISION',
          message: `Package "${e.id}" exists in both platform and ${scope} scopes — platform wins.`,
          packageId: e.id,
          scope,
        });
        continue;
      }
      out.set(e.id, { ...e, scope });
    }
  }

  return { entries: Array.from(out.values()), diagnostics };
}
