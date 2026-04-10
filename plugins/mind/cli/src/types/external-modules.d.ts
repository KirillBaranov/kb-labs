// Removed: declare module '@kb-labs/shared-command-kit' - now using real types
declare module '@kb-labs/mind-orchestrator';
declare module '@kb-labs/mind-engine';
declare module '@kb-labs/mind-contracts' {
  export interface MindSourceConfig {
    id: string;
    paths: string[];
    exclude?: string[];
    [key: string]: unknown;
  }

  export interface MindScopeConfig {
    id: string;
    sourceIds?: string[];
    defaultEngine?: string;
    [key: string]: unknown;
  }

  export interface MindEngineConfig {
    id: string;
    type: string;
    options?: Record<string, unknown>;
  }

  export interface MindSyncConfig {
    enabled: boolean;
    mode: 'manual' | 'watch';
    intervalMs: number;
    paths: string[];
    [key: string]: unknown;
  }

  export interface MindConfigInput {
    sources: MindSourceConfig[];
    scopes: MindScopeConfig[];
    engines: MindEngineConfig[];
    defaults?: {
      fallbackEngineId?: string;
      [key: string]: unknown;
    };
    sync?: MindSyncConfig;
    [key: string]: unknown;
  }

  export type MindConfig = MindConfigInput;

  export const defaultMindSyncConfig: MindSyncConfig;
}
