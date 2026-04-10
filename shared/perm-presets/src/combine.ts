import type { PermissionSpec, PermissionPreset, PresetBuilder, RuntimePermissionSpec, PlatformPermissions } from './types';

/**
 * Merge two string arrays, removing duplicates
 */
function mergeArrays(a?: string[], b?: string[]): string[] | undefined {
  if (!a && !b) {return undefined;}
  const set = new Set([...(a ?? []), ...(b ?? [])]);
  return set.size > 0 ? [...set] : undefined;
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

  const result: PermissionSpec['platform'] = {};

  // Merge each platform service (second value wins for booleans, arrays are merged)
  const keys = new Set([...Object.keys(base), ...Object.keys(next)]) as Set<keyof typeof base>;

  for (const key of keys) {
    const baseVal = base[key];
    const nextVal = next[key];

    if (nextVal === undefined) {
      result[key] = baseVal as any;
    } else if (Array.isArray(nextVal)) {
      // Merge arrays (for cache namespaces, storage paths)
      result[key] = mergeArrays(
        Array.isArray(baseVal) ? baseVal : undefined,
        nextVal
      ) as any;
    } else if (typeof nextVal === 'object' && nextVal !== null) {
      // Merge objects (for llm.models, vectorStore.collections, etc.)
      result[key] = { ...(typeof baseVal === 'object' ? baseVal : {}), ...nextVal } as any;
    } else {
      // Boolean or primitive - second value wins
      result[key] = nextVal as any;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
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
    };
    if (result.network.fetch === undefined) {delete result.network.fetch;}
    if (Object.keys(result.network).length === 0) {delete result.network;}
  }

  // Merge shell
  if (base.shell || next.shell) {
    result.shell = {
      allow: mergeArrays(base.shell?.allow, next.shell?.allow),
    };
    if (result.shell.allow === undefined) {delete result.shell.allow;}
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
 * Convert declarative PermissionSpec to explicit RuntimePermissionSpec
 *
 * Transforms:
 *   { mode: 'readWrite', allow: ['*.json'] }
 * Into:
 *   { read: ['*.json'], write: ['*.json'] }
 */
function toRuntimeFormat(spec: PermissionSpec): RuntimePermissionSpec {
  const result: RuntimePermissionSpec = {};

  // Convert fs: mode + allow → read[] + write[]
  if (spec.fs) {
    const { mode, allow } = spec.fs;
    result.fs = {};

    if (allow && allow.length > 0) {
      // read is always granted for allowed paths
      result.fs.read = [...allow];

      // write only if mode is 'readWrite'
      if (mode === 'readWrite') {
        result.fs.write = [...allow];
      }
    }

    if (Object.keys(result.fs).length === 0) {delete result.fs;}
  }

  // env, network, shell, platform, quotas pass through unchanged
  if (spec.env) {
    result.env = { ...spec.env };
  }

  if (spec.network) {
    result.network = { ...spec.network };
  }

  if (spec.shell) {
    result.shell = { ...spec.shell };
  }

  if (spec.platform) {
    result.platform = { ...spec.platform };
  }

  if (spec.quotas) {
    result.quotas = { ...spec.quotas };
  }

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

    build(): RuntimePermissionSpec {
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
export function combinePresets(...presets: (PermissionPreset | PermissionSpec)[]): RuntimePermissionSpec {
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
