import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { usePlatform, type PlatformServices } from '@kb-labs/sdk';
import { MindEngine } from '@kb-labs/mind-engine';
import type {
  MindConfigInput,
  MindEngineConfig,
  MindScopeConfig,
  MindSourceConfig,
} from '@kb-labs/mind-contracts';
import type {
  MindIndexStats,
  MindIntent,
  MindQueryResult,
} from '@kb-labs/mind-types';

export const MIND_PRODUCT_ID = 'mind';

export interface MindRuntimeService {
  index(scopeId: string): Promise<MindIndexStats>;
  query(options: {
    productId?: string;
    scopeId: string;
    text: string;
    intent?: MindIntent;
    limit?: number;
    profileId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<MindQueryResult>;
}

export interface MindRuntime {
  service: MindRuntimeService;
  config: MindConfigInput;
}

export interface MindRuntimeOptions {
  cwd: string;
  config?: MindConfigInput | Record<string, unknown>;
  runtime?: {
    fetch?: typeof fetch;
    fs?: unknown;
    env?: (key: string) => string | undefined;
    log?: (
      level: 'debug' | 'info' | 'warn' | 'error',
      msg: string,
      meta?: Record<string, unknown>,
    ) => void;
    analytics?: {
      track(event: string, properties?: Record<string, unknown>): void;
      metric(name: string, value: number, tags?: Record<string, string>): void;
    };
  };
  platform?: PlatformServices;
  onProgress?: (event: { stage: string; details?: string; metadata?: Record<string, unknown>; timestamp: number }) => void;
}

export async function createMindRuntime(options: MindRuntimeOptions): Promise<MindRuntime> {
  const config = await resolveConfig(options.cwd, options.config);
  const platform = options.platform ?? usePlatform();

  const service: MindRuntimeService = {
    index: async (scopeId: string) => {
      const scope = resolveScope(config, scopeId);
      const engine = createEngine(config, scope, options.cwd, options.runtime, platform, options.onProgress);
      await engine.init();
      const stats = await engine.index(resolveSources(config, scope), {
        scope,
        workspaceRoot: options.cwd,
      } as any);
      return stats as unknown as MindIndexStats;
    },
    query: async (queryOptions) => {
      if (queryOptions.productId && queryOptions.productId !== MIND_PRODUCT_ID) {
        throw new Error(`Unsupported productId "${queryOptions.productId}". Expected "${MIND_PRODUCT_ID}".`);
      }
      const scope = resolveScope(config, queryOptions.scopeId);
      const sources = resolveSources(config, scope);
      const engine = createEngine(config, scope, options.cwd, options.runtime, platform, options.onProgress);
      await engine.init();

      const result = await engine.query(
        {
          text: queryOptions.text,
          intent: queryOptions.intent ?? 'summary',
          limit: queryOptions.limit,
          profileId: queryOptions.profileId,
          metadata: queryOptions.metadata,
        } as any,
        {
          scope,
          sources,
          workspaceRoot: options.cwd,
          limit: queryOptions.limit,
          profile: queryOptions.profileId ? { id: queryOptions.profileId } : undefined,
        } as any,
      );

      return result as unknown as MindQueryResult;
    },
  };

  return {
    service,
    config,
  };
}

function createEngine(
  config: MindConfigInput,
  scope: MindScopeConfig,
  cwd: string,
  runtime: MindRuntimeOptions['runtime'],
  platform: PlatformServices | null | undefined,
  onProgress: MindRuntimeOptions['onProgress'],
): any {
  const engineConfig = resolveEngineConfig(config, scope);
  return new MindEngine(
    {
      id: engineConfig.id,
      type: engineConfig.type,
      options: {
        ...(engineConfig.options ?? {}),
        _runtime: runtime,
        platform: platform ?? undefined,
        onProgress,
      },
    } as any,
    {
      workspaceRoot: cwd,
    } as any,
  );
}

function resolveSources(config: MindConfigInput, scope: MindScopeConfig): MindSourceConfig[] {
  if (!scope.sourceIds?.length) {
    return config.sources;
  }
  const selected = config.sources.filter((source: MindSourceConfig) => scope.sourceIds!.includes(source.id));
  if (!selected.length) {
    throw new Error(`Scope "${scope.id}" does not reference existing sources.`);
  }
  return selected;
}

function resolveScope(config: MindConfigInput, scopeId: string): MindScopeConfig {
  const scope = config.scopes.find((item: MindScopeConfig) => item.id === scopeId);
  if (!scope) {
    throw new Error(`Scope "${scopeId}" is not defined in mind.scopes.`);
  }
  return scope;
}

function resolveEngineConfig(config: MindConfigInput, scope: MindScopeConfig): MindEngineConfig {
  const engineId = scope.defaultEngine ?? config.defaults?.fallbackEngineId ?? config.engines[0]?.id;
  if (!engineId) {
    throw new Error('No engines configured in mind config.');
  }
  const engine = config.engines.find((item: MindEngineConfig) => item.id === engineId);
  if (!engine) {
    throw new Error(`Engine "${engineId}" referenced by scope "${scope.id}" does not exist.`);
  }
  return engine;
}

async function resolveConfig(cwd: string, provided?: MindRuntimeOptions['config']): Promise<MindConfigInput> {
  if (provided) {
    return normalizeConfig(provided);
  }
  const configPath = await findConfigPath(cwd);
  const raw = JSON.parse(await readFile(configPath, 'utf8')) as Record<string, unknown>;
  return normalizeConfig(raw);
}

async function findConfigPath(cwd: string): Promise<string> {
  const candidates = [
    path.resolve(cwd, '.kb/kb.config.json'),
    path.resolve(cwd, 'kb.config.json'),
  ];

  for (const candidate of candidates) {
    try {
      await readFile(candidate, 'utf8');
      return candidate;
    } catch {
      // continue
    }
  }

  throw new Error('No kb.config.json found. Expected .kb/kb.config.json or kb.config.json.');
}

function normalizeConfig(raw: MindRuntimeOptions['config']): MindConfigInput {
  const data = raw as Record<string, unknown>;

  // Canonical format: profiles[].products.mind
  if (Array.isArray(data.profiles) && data.profiles.length > 0) {
    const profile = (data.profiles as Array<Record<string, unknown>>).find((p) => p.id === 'default')
      ?? (data.profiles as Array<Record<string, unknown>>)[0];
    const products = profile?.products as Record<string, unknown> | undefined;
    const mindConfig = products?.[MIND_PRODUCT_ID] as MindConfigInput | undefined;
    if (!mindConfig) {
      throw new Error('Config does not contain profiles[].products.mind section.');
    }
    return validateConfig(mindConfig);
  }

  // Optional root-level format: { mind: {...} }
  if (data.mind && typeof data.mind === 'object') {
    return validateConfig(data.mind as MindConfigInput);
  }

  return validateConfig(data as unknown as MindConfigInput);
}

function validateConfig(config: MindConfigInput): MindConfigInput {
  if (!Array.isArray(config.sources) || !Array.isArray(config.scopes) || !Array.isArray(config.engines)) {
    throw new Error('Invalid mind config: required arrays sources/scopes/engines are missing.');
  }
  return config;
}
