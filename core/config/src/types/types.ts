export type Diagnostic =
    | { level: "warn" | "error"; code: string; message: string; detail?: unknown }
    | { level: "info"; code: string; message: string };

export type JsonReadResult<T = unknown> =
    | { ok: true; data: T; diagnostics: Diagnostic[] }
    | { ok: false; diagnostics: Diagnostic[] };

export interface FindNearestConfigOpts {
    startDir?: string;
    stopDir?: string;             // stop climbing at/before this dir (e.g., repo root)
    filenames: string[];          // e.g., [".kb-labsrc.json", ".sentinelrc.json"]
}

export interface ProfilesConfig {
    rootDir?: string;
    defaultName?: string;
    strict?: boolean;
}

export interface KBConfig {
    profiles?: ProfilesConfig;
}

// New types for enhanced config system

export interface MergeTrace {
  path: string;
  source: string;
  type: 'set' | 'overwriteArray';
  layer: string;
  profileRef?: string;
  presetRef?: string;
  version?: string;
}

export interface ProfileLayerInput {
  profileId: string;
  source: string;
  products?: Record<string, unknown>;
  scope?: {
    id: string;
    source: string;
    products?: Record<string, unknown>;
  };
}

export interface ResolveOptions {
  cwd: string;
  /**
   * Product identifier (e.g., 'mind', 'aiReview', 'workflow')
   */
  product: string;
  cli?: Record<string, unknown>;
  writeFinal?: boolean;
  profileLayer?: ProfileLayerInput;
}

export interface ConfigLayer {
  label: string;
  value: any;
  source: string;
}

export interface ProductConfigResult<T = Record<string, any>> {
  config: T;
  trace: MergeTrace[];
}