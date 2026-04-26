/**
 * Dependencies indexer for KB Labs Mind
 */

import { promises as fsp } from 'node:fs';
import { join, resolve, dirname, sep, isAbsolute } from 'node:path';
import { realpath } from 'node:fs/promises';
import * as ts from 'typescript';
import type { PackageNode } from '@kb-labs/mind-types';
import type { IndexerContext } from '../types';
import { toPosix } from '@kb-labs/mind-core';
import { writeJson } from '../fs/json';

const CANDIDATE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.d.ts'];

async function fileExists(path: string): Promise<boolean> {
  try {
    await fsp.access(path);
    return true;
  } catch {
    return false;
  }
}

async function resolveWithExtensions(basePath: string): Promise<string | null> {
  if (await fileExists(basePath)) {
    return basePath;
  }

  for (const ext of CANDIDATE_EXTENSIONS) {
    const candidate = basePath + ext;
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  for (const ext of CANDIDATE_EXTENSIONS) {
    const indexPath = join(basePath, 'index' + ext);
    if (await fileExists(indexPath)) {
      return indexPath;
    }
  }

  return null;
}

/**
 * Compute edge priority for AI token economy
 */
function computeEdgePriority(edge: { from: string; to: string; type: string; imports?: string[] }): 'noise' | 'important' | 'critical' | 'normal' {
  if (edge.type === 'type' && (!edge.imports || edge.imports.length === 0)) {return 'noise';}
  if (edge.imports && edge.imports.length >= 5) {return 'important';}
  if (edge.from.includes('/src/index.') || edge.from.includes('/bin.')) {return 'critical';}
  return 'normal';
}

interface ResolvedModuleInfo {
  path: string | null;
  external?: string;
  isType?: boolean;
}

/**
 * Compute graph summary for AI insights
 */
interface PackageEntry { deps?: string[]; [key: string]: unknown }
interface GraphSummary { totalEdges: number; internalEdges: number; externalDeps: string[]; hotspots: Array<{ file: string; inbound: number; outbound: number }>; maxDepth: number; packageGraph: Record<string, string[]> }
function computeGraphSummary(edges: Array<{ from: string; to: string; type: string; imports?: string[] }>, packages: Record<string, PackageEntry>, externalImports: Set<string>): GraphSummary {
  const fileConnections = new Map<string, { in: number; out: number }>();
  const externalDepsSet = new Set<string>();
  
  for (const edge of edges) {
    const from = fileConnections.get(edge.from) || { in: 0, out: 0 };
    const to = fileConnections.get(edge.to) || { in: 0, out: 0 };
    from.out++;
    to.in++;
    fileConnections.set(edge.from, from);
    fileConnections.set(edge.to, to);
  }
  
  const hotspots = Array.from(fileConnections.entries())
    .filter(([_, conn]) => conn.in + conn.out >= 10)
    .sort((a, b) => (b[1].in + b[1].out) - (a[1].in + a[1].out))
    .slice(0, 10)
    .map(([file, conn]) => ({ file, inbound: conn.in, outbound: conn.out }));
  
  for (const pkg of Object.values(packages)) {
    for (const dep of pkg.deps || []) {
      if (!dep.startsWith('@kb-labs/')) {externalDepsSet.add(dep);}
    }
  }

  externalImports.forEach(dep => {
    if (!dep.startsWith('@kb-labs/')) {
      externalDepsSet.add(dep);
    }
  });
  
  const packageGraph: Record<string, string[]> = {};
  for (const [name, pkg] of Object.entries(packages)) {
    packageGraph[name] = (pkg.deps || []).filter((d: string) => packages[d]);
  }
  
  return {
    totalEdges: edges.length,
    internalEdges: edges.filter(e => !e.to.includes('node_modules')).length,
    externalDeps: Array.from(externalDepsSet).slice(0, 20),
    hotspots,
    maxDepth: 0,
    packageGraph
  };
}

/**
 * Index package dependencies
 */
export async function indexDependencies(
  ctx: IndexerContext
): Promise<{ edgesAdded: number; edgesRemoved: number }> {
  let edgesAdded = 0;
  let edgesRemoved = 0;
  const externalImports = new Set<string>();

  try {
    const previousEdges = Array.isArray(ctx.depsGraph.edges) ? [...ctx.depsGraph.edges] : [];
    ctx.depsGraph.packages = {};

    // Read tsconfig.json if exists
    const tsconfigPath = join(ctx.cwd, 'tsconfig.json');
    let compilerOptions: ts.CompilerOptions = {};
    let baseUrl: string | undefined;
    let paths: Record<string, string[]> = {};

    try {
      const tsconfigContent = await fsp.readFile(tsconfigPath, 'utf8');
      const tsconfig = JSON.parse(tsconfigContent);
      const rawPaths = tsconfig.compilerOptions?.paths || {};
      const rawBaseUrl = tsconfig.compilerOptions?.baseUrl;
      const parsed = ts.convertCompilerOptionsFromJson(tsconfig.compilerOptions ?? {}, ctx.cwd);
      compilerOptions = parsed.options;
      baseUrl = compilerOptions.baseUrl ?? rawBaseUrl;
      paths = compilerOptions.paths && Object.keys(compilerOptions.paths).length > 0
        ? compilerOptions.paths
        : rawPaths;
      if (parsed.errors?.length) {
        parsed.errors.forEach(err => {
          ctx.log({
            level: 'warn',
            code: 'MIND_PARSE_ERROR',
            msg: 'tsconfig option conversion warning',
            error: ts.flattenDiagnosticMessageText(err.messageText, '\n')
          });
        });
      }
    } catch {
      // No tsconfig.json, use defaults
    }

    // Find all TypeScript/JavaScript files recursively
    const allFiles: string[] = [];
    
    // Scan root directory
    await findTsFiles(ctx.cwd, allFiles);
    
    // Also scan workspace packages
    const packageJsonPath = join(ctx.cwd, 'package.json');
    try {
      const packageJson = JSON.parse(await fsp.readFile(packageJsonPath, 'utf8'));
      if (packageJson.workspaces) {
        const workspaces = Array.isArray(packageJson.workspaces) 
          ? packageJson.workspaces 
          : packageJson.workspaces.packages || [];
        
        for (const pattern of workspaces) {
          const packagesDir = pattern.replace('/*', '');
          const packagesPath = join(ctx.cwd, packagesDir);
          
          try {
            const entries = await fsp.readdir(packagesPath, { withFileTypes: true });
            for (const entry of entries) {
              if (entry.isDirectory()) {
                const pkgPath = join(packagesPath, entry.name);
                // Scan TypeScript files in this package
                await findTsFiles(pkgPath, allFiles);
                
                // Also add package info
                const pkgJsonPath = join(pkgPath, 'package.json');
                try {
                  const pkgJson = JSON.parse(await fsp.readFile(pkgJsonPath, 'utf8'));
                  ctx.depsGraph.packages[pkgJson.name || entry.name] = {
                    name: pkgJson.name || entry.name,
                    version: pkgJson.version,
                    private: pkgJson.private || false,
                    dir: join(packagesDir, entry.name),
                    deps: Object.keys(pkgJson.dependencies || {})
                  };
                } catch {
                  // Skip packages without package.json
                }
              }
            }
          } catch {
            // Skip if workspace directory doesn't exist
          }
        }
      }

      const rootPackage: PackageNode = {
        name: packageJson.name || 'unknown',
        version: packageJson.version,
        private: packageJson.private || false,
        dir: '.',
        deps: Object.keys(packageJson.dependencies || {})
      };
      ctx.depsGraph.packages[rootPackage.name] = rootPackage;
    } catch {
      // Not a monorepo, only root directory scanned
    }

    // Remove duplicates and sort
    const uniqueFiles = [...new Set(allFiles)].sort();

    // Process files in batches to respect time budget
    // REDUCED from 50 to 10 to prevent OOM when loading TypeScript AST
    const batchSize = 10;
    const edges: Array<{ from: string; to: string; type: 'runtime' | 'type'; imports?: string[] }> = [];

    for (let i = 0; i < uniqueFiles.length; i += batchSize) {
      // Check time budget
      if (Date.now() - ctx.startTime >= ctx.timeBudgetMs) {
        ctx.log({
          level: 'warn',
          code: 'MIND_TIME_BUDGET',
          msg: 'Time budget exceeded during dependency indexing',
          filesProcessed: i,
          totalFiles: uniqueFiles.length
        });
        break;
      }

      const batch = uniqueFiles.slice(i, i + batchSize);
      await processBatch(batch, ctx, compilerOptions, baseUrl, paths, edges, externalImports);

      // Force garbage collection after each batch if available
      // This prevents memory accumulation from TypeScript compiler ASTs
      if (global.gc) {
        global.gc();
      }
    }

    // Normalize paths and filter to workspace
    const normalizedEdges = [];
    for (const edge of edges) {
      try {
        const fromReal = await realpath(edge.from);
        const toReal = await realpath(edge.to);
        
        // Convert to POSIX paths relative to workspace
        const fromPosix = toPosix(fromReal.replace(ctx.root + '/', ''));
        const toPosixPath = toPosix(toReal.replace(ctx.root + '/', ''));
        
        // Only include edges within workspace
        if (fromPosix && toPosixPath && 
            !fromPosix.includes('node_modules') && 
            !toPosixPath.includes('node_modules')) {
          normalizedEdges.push({
            from: fromPosix,
            to: toPosixPath,
            type: edge.type,
            imports: edge.imports,
            priority: computeEdgePriority(edge),
            weight: 1
          });
        }
      } catch (_error) {
        // Skip invalid paths
        ctx.log({
          level: 'warn',
          code: 'MIND_PARSE_ERROR',
          msg: `Failed to normalize path: ${edge.from} -> ${edge.to}`,
          error: _error instanceof Error ? _error.message : String(_error)
        });
      }
    }

    // Sort edges deterministically by (from, to, type)
    normalizedEdges.sort((a, b) => {
      if (a.from !== b.from) {return a.from.localeCompare(b.from);}
      if (a.to !== b.to) {return a.to.localeCompare(b.to);}
      return a.type.localeCompare(b.type);
    });

    // Sort imports arrays alphabetically for deterministic output
    normalizedEdges.forEach(edge => {
      if (edge.imports) {
        edge.imports.sort();
      }
    });

    // Update deps graph
    const prevKeySet = new Set(previousEdges.map(edge => `${edge.from}→${edge.to}:${edge.type}`));
    const newKeySet = new Set<string>();
    for (const edge of normalizedEdges) {
      newKeySet.add(`${edge.from}→${edge.to}:${edge.type}`);
    }

    let intersection = 0;
    for (const key of newKeySet) {
      if (prevKeySet.has(key)) {
        intersection++;
      }
    }

    edgesAdded = newKeySet.size - intersection;
    edgesRemoved = prevKeySet.size - intersection;

    // Update the context's deps graph
    ctx.depsGraph.edges = normalizedEdges;

    // Compute graph summary
    const summary = computeGraphSummary(normalizedEdges, ctx.depsGraph.packages, externalImports);
    ctx.depsGraph.summary = summary;

    // Save deps graph to disk
    await writeJson(`${ctx.cwd}/.kb/mind/deps.json`, ctx.depsGraph);

  } catch (error: unknown) {
    ctx.log({
      level: 'error',
      code: 'MIND_PARSE_ERROR',
      msg: 'Failed to index dependencies',
      error: error instanceof Error ? error.message : String(error)
    });
  }

  return { edgesAdded, edgesRemoved };
}

/**
 * Recursively find TypeScript/JavaScript files
 */
async function findTsFiles(dir: string, files: string[]): Promise<void> {
  try {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      
      // Skip excluded directories
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || 
            entry.name === '.git' || 
            entry.name === '.kb' ||
            entry.name === 'dist' ||
            entry.name === 'coverage' ||
            entry.name === 'fixtures' ||
            entry.name === '__tests__') {
          continue;
        }
        await findTsFiles(fullPath, files);
      } else if (entry.isFile()) {
        // Check if it's a TypeScript/JavaScript file
        if (entry.name.match(/\.(ts|tsx|js|jsx)$/) && 
            !entry.name.endsWith('.d.ts') && 
            !entry.name.endsWith('.map')) {
          files.push(fullPath);
        }
      }
    }
  } catch {
    // Skip directories we can't read
  }
}

/**
 * Process a batch of files
 */
async function processBatch(
  files: string[],
  ctx: IndexerContext,
  compilerOptions: ts.CompilerOptions,
  baseUrl: string | undefined,
  paths: Record<string, string[]>,
  edges: Array<{ from: string; to: string; type: 'runtime' | 'type'; imports?: string[] }>,
  externalImports: Set<string>
): Promise<void> {
  try {
    // Create TypeScript program for this batch
    const program = ts.createProgram(files, {
      ...compilerOptions,
      allowJs: true,
      checkJs: false,
      noEmit: true,
      skipLibCheck: true
    });

    const sourceFiles = program.getSourceFiles();

    for (const sourceFile of sourceFiles) {
      try {
        await processSourceFile(sourceFile, ctx, compilerOptions, baseUrl, paths, edges, externalImports);
      } catch (error: unknown) {
        ctx.log({
          level: 'warn',
          code: 'MIND_PARSE_ERROR',
          msg: `Failed to process file: ${sourceFile.fileName}`,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  } catch (error: unknown) {
    ctx.log({
      level: 'warn',
      code: 'MIND_PARSE_ERROR',
      msg: 'Failed to create TypeScript program for batch',
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * Extract imported symbol names from TypeScript node
 */
function extractImportedNames(node: ts.Node): string[] {
  const names: string[] = [];
  
  if (ts.isImportDeclaration(node)) {
    const clause = node.importClause;
    if (!clause) {return names;}
    
    // Default import: import Foo from '...'
    if (clause.name) {
      names.push(clause.name.text);
    }
    
    // Named imports: import { a, b } from '...'
    if (clause.namedBindings) {
      if (ts.isNamedImports(clause.namedBindings)) {
        clause.namedBindings.elements.forEach(el => {
          names.push(el.name.text);
        });
      }
      // Namespace import: import * as X from '...'
      else if (ts.isNamespaceImport(clause.namedBindings)) {
        names.push(clause.namedBindings.name.text);
      }
    }
  }
  
  return names;
}

/**
 * Process a single source file
 */
async function processSourceFile(
  sourceFile: ts.SourceFile,
  ctx: IndexerContext,
  compilerOptions: ts.CompilerOptions,
  baseUrl: string | undefined,
  paths: Record<string, string[]>,
  edges: Array<{ from: string; to: string; type: 'runtime' | 'type'; imports?: string[] }>,
  externalImports: Set<string>
): Promise<void> {
  const fileName = sourceFile.fileName;
  const visit = async (node: ts.Node) => {
    // Import declarations
    if (ts.isImportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const moduleSpecifier = node.moduleSpecifier.text;
      const resolution = await resolveModule(fileName, moduleSpecifier, compilerOptions, baseUrl, paths, ctx.cwd);
      if (resolution) {
        if (resolution.external) {
          externalImports.add(resolution.external);
        }
        if (resolution.path) {
          const imports = extractImportedNames(node);
          const isTypeImport = Boolean(node.importClause?.isTypeOnly);
          const edgeType: 'runtime' | 'type' = (isTypeImport || resolution.isType) ? 'type' : 'runtime';
          edges.push({
            from: fileName,
            to: resolution.path,
            type: edgeType,
            imports
          });
        }
      }
    }

    // Export declarations with 'from'
    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const moduleSpecifier = node.moduleSpecifier.text;
      const resolution = await resolveModule(fileName, moduleSpecifier, compilerOptions, baseUrl, paths, ctx.cwd);
      if (resolution) {
        if (resolution.external) {
          externalImports.add(resolution.external);
        }
        if (resolution.path) {
          const imports = extractImportedNames(node);
          const edgeType: 'runtime' | 'type' = (node.isTypeOnly || resolution.isType) ? 'type' : 'runtime';
          edges.push({
            from: fileName,
            to: resolution.path,
            type: edgeType,
            imports
          });
        }
      }
    }

    // Dynamic imports
    if (ts.isCallExpression(node) && 
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments.length > 0 &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0])) {
      const moduleSpecifier = node.arguments[0].text;
      const resolution = await resolveModule(fileName, moduleSpecifier, compilerOptions, baseUrl, paths, ctx.cwd);
      if (resolution) {
        if (resolution.external) {
          externalImports.add(resolution.external);
        }
        if (resolution.path) {
          edges.push({
            from: fileName,
            to: resolution.path,
            type: resolution.isType ? 'type' : 'runtime',
            imports: [] // Dynamic imports don't have named imports
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  await visit(sourceFile);
}

/**
 * Resolve module path using TypeScript resolution
 */
function extractPackageName(moduleSpecifier: string): string {
  if (moduleSpecifier.startsWith('@')) {
    const parts = moduleSpecifier.split('/');
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : moduleSpecifier;
  }
  const [packageName] = moduleSpecifier.split('/');
  return packageName ?? moduleSpecifier;
}

function extractPackageNameFromPath(resolvedPath: string): string | null {
  const marker = `${sep}node_modules${sep}`;
  const idx = resolvedPath.lastIndexOf(marker);
  if (idx === -1) {return null;}
  const remainder = resolvedPath.slice(idx + marker.length);
  const segments = remainder.split(sep);
  const [firstSegment, secondSegment] = segments;
  if (firstSegment?.startsWith('@') && secondSegment) {
    return `${firstSegment}/${secondSegment}`;
  }
  return firstSegment ?? null;
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceWildcards(template: string, captures: string[]): string {
  let result = template;
  for (const capture of captures) {
    result = result.replace('*', capture);
  }
  return result;
}

function normalizeModuleResolutionKind(
  value: ts.ModuleResolutionKind | string | undefined
): ts.ModuleResolutionKind | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === 'number') {
    return value as ts.ModuleResolutionKind;
  }

  switch (value.toLowerCase()) {
    case 'classic':
      return ts.ModuleResolutionKind.Classic;
    case 'node':
    case 'nodejs':
    case 'node10':
      return ts.ModuleResolutionKind.Node10;
    case 'node16':
      return ts.ModuleResolutionKind.Node16;
    case 'nodenext':
      return ts.ModuleResolutionKind.NodeNext;
    case 'bundler':
      return ts.ModuleResolutionKind.Bundler;
    default:
      return undefined;
  }
}

async function resolveViaPaths(
  moduleSpecifier: string,
  projectRoot: string,
  baseUrl: string | undefined,
  paths: Record<string, string[]>
): Promise<string | null> {
  if (!paths || Object.keys(paths).length === 0) {
    return null;
  }

  const baseDir = baseUrl ? resolve(projectRoot, baseUrl) : projectRoot;

  for (const [pattern, replacements] of Object.entries(paths)) {
    const regex = new RegExp('^' + escapeForRegex(pattern).replace(/\\\*/g, '(.*)') + '$');
    const match = moduleSpecifier.match(regex);
    if (!match) {
      continue;
    }

    const captures = match.slice(1);
    for (const replacement of replacements) {
      const substituted = replaceWildcards(replacement, captures);
      const candidateBase = isAbsolute(substituted)
        ? substituted
        : resolve(baseDir, substituted);
      const resolved = await resolveWithExtensions(candidateBase);
      if (resolved) {
        return resolved;
      }
      // Strip .js/.jsx/.mjs/.cjs extension and retry (TS uses .js imports for .ts files)
      const strippedBase = candidateBase.replace(/\.(js|jsx|mjs|cjs)$/, '');
      if (strippedBase !== candidateBase) {
        const resolvedStripped = await resolveWithExtensions(strippedBase);
        if (resolvedStripped) {
          return resolvedStripped;
        }
      }
    }
  }

  return null;
}

async function resolveModule(
  fromFile: string,
  moduleSpecifier: string,
  _compilerOptions: ts.CompilerOptions,
  _baseUrl: string | undefined,
  _paths: Record<string, string[]>,
  projectRoot: string
): Promise<ResolvedModuleInfo | null> {
  try {
    const options: ts.CompilerOptions = {
      ..._compilerOptions,
      baseUrl: _baseUrl ?? _compilerOptions.baseUrl,
      paths: Object.keys(_paths || {}).length > 0 ? { ..._compilerOptions.paths, ..._paths } : _compilerOptions.paths
    };

    const normalizedModuleResolution = normalizeModuleResolutionKind(options.moduleResolution);
    if (normalizedModuleResolution !== undefined) {
      options.moduleResolution = normalizedModuleResolution;
    }

    const resolution = ts.resolveModuleName(moduleSpecifier, fromFile, options, ts.sys);
    const resolved = resolution.resolvedModule;

    if (resolved?.resolvedFileName) {
      let externalName: string | undefined;
      if (resolved.isExternalLibraryImport) {
        if (resolved.packageId?.name) {
          externalName = resolved.packageId.name;
        } else if (!moduleSpecifier.startsWith('.')) {
          externalName = extractPackageName(moduleSpecifier);
        } else {
          const inferred = extractPackageNameFromPath(resolved.resolvedFileName);
          externalName = inferred ?? undefined;
        }
      }

      const info: ResolvedModuleInfo = {
        path: resolved.resolvedFileName,
        isType: resolved.extension === ts.Extension.Dts,
        external: externalName
      };

      return info;
    }
  } catch {
    // fall through to manual resolution
  }

  const aliasResolved = await resolveViaPaths(moduleSpecifier, projectRoot, _baseUrl, _paths);
  if (aliasResolved) {
    let externalName: string | undefined;
    if (aliasResolved.includes(`${sep}node_modules${sep}`)) {
      externalName = extractPackageNameFromPath(aliasResolved) ?? extractPackageName(moduleSpecifier);
    }
    return {
      path: aliasResolved,
      isType: aliasResolved.endsWith('.d.ts'),
      external: externalName
    };
  }

  // Manual fallback for basic relative resolution
  try {
    const fromDir = dirname(fromFile);
    const resolvedPath = resolve(fromDir, moduleSpecifier);

    const resolvedWithExtension = await resolveWithExtensions(resolvedPath);
    if (resolvedWithExtension) {
      let externalName: string | undefined;
      if (resolvedWithExtension.includes(`${sep}node_modules${sep}`)) {
        externalName = extractPackageNameFromPath(resolvedWithExtension) ?? extractPackageName(moduleSpecifier);
      }
      return {
        path: resolvedWithExtension,
        isType: resolvedWithExtension.endsWith('.d.ts'),
        external: externalName
      };
    }

    return { path: resolvedPath };
  } catch {
    return null;
  }
}
