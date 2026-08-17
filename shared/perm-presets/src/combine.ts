import type { PermissionSpec as ContractsPermissionSpec } from '@kb-labs/plugin-contracts';
import type { PermissionSpec, PermissionPreset, PresetBuilder, PlatformPermissions } from './types';

/**
 * Merge two string arrays, removing duplicates
 */
function mergeArrays(a?: string[], b?: string[]): string[] | undefined {
  if (!a && !b) {return undefined;}
  const set = new Set([...(a ?? []), ...(b ?? [])]);
  return set.size > 0 ? [...set] : undefined;
}

/**
 * Merge { connect?: string[] } specs for TCP and WebSocket
 */
function mergeConnectSpec(
  a?: { connect?: string[] },
  b?: { connect?: string[] }
): { connect?: string[] } | undefined {
  if (!a && !b) {return undefined;}
  const connect = mergeArrays(a?.connect, b?.connect);
  return connect !== undefined ? { connect } : {};
}

/**
 * Merge platform permissions
 */
function mergePlatformPermissions(
  base?: PermissionSpec['platform'],
  next?: PermissionSpec['platform']
): PermissionSpec['platform'] | undefined {
  if (!base && !next) {return undefined;}
  if (!base) {return next;}
  if (!next) {return base;}

  type PlatformSpec = NonNullable<PermissionSpec['platform']>;
  type PlatformValue = PlatformSpec[keyof PlatformSpec];
  const result: Record<string, PlatformValue> = {};

  // Merge each platform service (second value wins for booleans, arrays are merged)
  const keys = new Set([...Object.keys(base), ...Object.keys(next)]) as Set<keyof PlatformSpec>;

  for (const key of keys) {
    const baseVal = base[key];
    const nextVal = next[key];

    if (nextVal === undefined) {
      result[key as string] = baseVal;
    } else if (Array.isArray(nextVal)) {
      // Merge arrays (for cache namespaces, storage paths)
      result[key as string] = mergeArrays(
        Array.isArray(baseVal) ? baseVal : undefined,
        nextVal
      ) as PlatformValue;
    } else if (typeof nextVal === 'object' && nextVal !== null) {
      // Merge objects (for llm.models, vectorStore.collections, etc.)
      result[key as string] = { ...(typeof baseVal === 'object' ? baseVal : {}), ...nextVal } as PlatformValue;
    } else {
      // Boolean or primitive - second value wins
      result[key as string] = nextVal;
    }
  }

  return Object.keys(result).length > 0 ? (result as PlatformSpec) : undefined;
}

/**
 * Merge two permission specs together
 * Arrays are merged (union), scalars use the second value
 */
function mergeSpecs(base: PermissionSpec, next: PermissionSpec): PermissionSpec {
  const result: PermissionSpec = {};

  // Merge fs
  if (base.fs || next.fs) {
    result.fs = {
      // readWrite wins over read
      mode: next.fs?.mode ?? base.fs?.mode,
      allow: mergeArrays(base.fs?.allow, next.fs?.allow),
    };
    // Clean up undefined fields
    if (result.fs.mode === undefined) {delete result.fs.mode;}
    if (result.fs.allow === undefined) {delete result.fs.allow;}
    if (Object.keys(result.fs).length === 0) {delete result.fs;}
  }

  // Merge env
  if (base.env || next.env) {
    result.env = {
      read: mergeArrays(base.env?.read, next.env?.read),
    };
    if (result.env.read === undefined) {delete result.env.read;}
    if (Object.keys(result.env).length === 0) {delete result.env;}
  }

  // Merge network
  if (base.network || next.network) {
    result.network = {
      fetch: mergeArrays(base.network?.fetch, next.network?.fetch),
      tcp: mergeConnectSpec(base.network?.tcp, next.network?.tcp),
      ws: mergeConnectSpec(base.network?.ws, next.network?.ws),
    };
    if (result.network.fetch === undefined) {delete result.network.fetch;}
    if (result.network.tcp === undefined) {delete result.network.tcp;}
    if (result.network.ws === undefined) {delete result.network.ws;}
    if (Object.keys(result.network).length === 0) {delete result.network;}
  }

  // Merge shell (allow lists are merged, maxConcurrent: second value wins)
  if (base.shell || next.shell) {
    result.shell = {
      allow: mergeArrays(base.shell?.allow, next.shell?.allow),
      maxConcurrent: next.shell?.maxConcurrent ?? base.shell?.maxConcurrent,
    };
    if (result.shell.allow === undefined) {delete result.shell.allow;}
    if (result.shell.maxConcurrent === undefined) {delete result.shell.maxConcurrent;}
    if (Object.keys(result.shell).length === 0) {delete result.shell;}
  }

  // Merge platform
  result.platform = mergePlatformPermissions(base.platform, next.platform);

  // Merge quotas (second value wins)
  if (base.quotas || next.quotas) {
    result.quotas = {
      timeoutMs: next.quotas?.timeoutMs ?? base.quotas?.timeoutMs,
      memoryMb: next.quotas?.memoryMb ?? base.quotas?.memoryMb,
      cpuMs: next.quotas?.cpuMs ?? base.quotas?.cpuMs,
    };
    if (result.quotas.timeoutMs === undefined) {delete result.quotas.timeoutMs;}
    if (result.quotas.memoryMb === undefined) {delete result.quotas.memoryMb;}
    if (result.quotas.cpuMs === undefined) {delete result.quotas.cpuMs;}
    if (Object.keys(result.quotas).length === 0) {delete result.quotas;}
  }

  return result;
}

/**
 * Convert declarative PermissionSpec to explicit ContractsPermissionSpec.
 *
 * Transforms:
 *   fs: { mode: 'readWrite', allow: ['*.json'] } → fs: { read: ['*.json'], write: ['*.json'] }
 *   platform.cache: ['ns:'] → platform.cache: { namespaces: ['ns:'] }
 *   platform.storage: ['path/'] → platform.storage: { paths: ['path/'] }
 */
function toRuntimeFormat(spec: PermissionSpec): ContractsPermissionSpec {
  const result: ContractsPermissionSpec = {};

  // Convert fs: mode + allow → read[] + write[]
  if (spec.fs) {
    const { mode, allow } = spec.fs;
    result.fs = {};

    if (allow && allow.length > 0) {
      result.fs.read = [...allow];
      if (mode === 'readWrite') {
        result.fs.write = [...allow];
      }
    }

    if (Object.keys(result.fs).length === 0) {delete result.fs;}
  }

  if (spec.env) { result.env = { ...spec.env }; }

  if (spec.network) {
    result.network = {};
    if (spec.network.fetch) {result.network.fetch = [...spec.network.fetch];}
    if (spec.network.tcp) {result.network.tcp = { ...spec.network.tcp };}
    if (spec.network.ws) {result.network.ws = { ...spec.network.ws };}
    if (Object.keys(result.network).length === 0) {delete result.network;}
  }

  if (spec.shell) { result.shell = { ...spec.shell }; }

  if (spec.platform) {
    const { cache, storage, database, ...rest } = spec.platform;
    result.platform = {
      ...rest as NonNullable<ContractsPermissionSpec['platform']>,
      ...(cache !== undefined && {
        cache: Array.isArray(cache) ? { namespaces: cache } : cache,
      }),
      ...(storage !== undefined && {
        storage: Array.isArray(storage) ? { paths: storage } : storage as boolean | { paths?: string[] },
      }),
      ...(database !== undefined && typeof database === 'object' && {
        database: {
          // `sql`/`timeseries` have no runtime governance yet (no adapter
          // consumes them) — passed through as-is, inert until one exists.
          ...(database.sql !== undefined && { sql: database.sql }),
          ...(database.timeseries !== undefined && { timeseries: database.timeseries }),
          // The raw contract's `document` grant is object-only (no boolean
          // "full access" shorthand) — only the `{ collections }` form
          // translates; `true`/`false` builder shorthands are not
          // representable and are dropped rather than mistranslated.
          ...(database.document !== undefined &&
            typeof database.document === 'object' && {
              document: {
                owns: database.document.collections ?? [],
                // A plugin declaring collections needs to create them.
                ddl: { ownCollections: true },
              },
            }),
          // Raw contract has no key-prefix scoping yet — `prefixes` is
          // accepted at the builder level for forward-compatibility but
          // currently has no runtime effect.
          ...(database.kv !== undefined && database.kv !== false && { kvStore: {} }),
        },
      }),
    };
  }

  if (spec.quotas) { result.quotas = { ...spec.quotas }; }

  return result;
}

/**
 * Create a builder for combining permission presets
 *
 * @example
 * ```typescript
 * const permissions = combine()
 *   .with(presets.gitWorkflow)
 *   .with(presets.npmPublish)
 *   .withEnv(['MY_CUSTOM_VAR'])
 *   .build();
 * ```
 */
export function combine(): PresetBuilder {
  let accumulated: PermissionSpec = {};

  const builder: PresetBuilder = {
    with(preset: PermissionPreset | PermissionSpec): PresetBuilder {
      const spec = 'permissions' in preset ? preset.permissions : preset;
      accumulated = mergeSpecs(accumulated, spec);
      return builder;
    },

    withEnv(vars: string[]): PresetBuilder {
      accumulated = mergeSpecs(accumulated, { env: { read: vars } });
      return builder;
    },

    withFs(fs: PermissionSpec['fs']): PresetBuilder {
      if (fs) {
        accumulated = mergeSpecs(accumulated, { fs });
      }
      return builder;
    },

    withNetwork(network: PermissionSpec['network']): PresetBuilder {
      if (network) {
        accumulated = mergeSpecs(accumulated, { network });
      }
      return builder;
    },

    withShell(shell: PermissionSpec['shell']): PresetBuilder {
      if (shell) {
        accumulated = mergeSpecs(accumulated, { shell });
      }
      return builder;
    },

    withPlatform(platform: PermissionSpec['platform']): PresetBuilder {
      if (platform) {
        accumulated = mergeSpecs(accumulated, { platform });
      }
      return builder;
    },

    withQuotas(quotas: PermissionSpec['quotas']): PresetBuilder {
      if (quotas) {
        accumulated = mergeSpecs(accumulated, { quotas });
      }
      return builder;
    },

    withStorage(storage: PlatformPermissions['storage']): PresetBuilder {
      if (storage !== undefined) {
        accumulated = mergeSpecs(accumulated, {
          platform: { storage },
        });
      }
      return builder;
    },

    withDatabase(database: PlatformPermissions['database']): PresetBuilder {
      if (database !== undefined) {
        accumulated = mergeSpecs(accumulated, {
          platform: { database },
        });
      }
      return builder;
    },

    build(): ContractsPermissionSpec {
      return toRuntimeFormat(accumulated);
    },
  };

  return builder;
}

/**
 * Quickly combine multiple presets into a single permission spec
 *
 * @example
 * ```typescript
 * const permissions = combinePresets(presets.gitWorkflow, presets.npmPublish);
 * ```
 */
export function combinePresets(...presets: (PermissionPreset | PermissionSpec)[]): ContractsPermissionSpec {
  let builder = combine();
  for (const preset of presets) {
    builder = builder.with(preset);
  }
  return builder.build();
}

/**
 * Export toRuntimeFormat for advanced use cases
 */
export { toRuntimeFormat };
