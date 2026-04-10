/**
 * @module @kb-labs/mind-engine/adapters/runtime-adapter
 * Runtime Adapter interface for sandbox Runtime API abstraction
 */

// Type definitions for fetch API (compatible with Node.js 18+ and browsers)
// Using simple types to avoid dependency on global types
type FetchInput = string | { url: string } | { href: string };
type FetchInit = {
  method?: string;
  headers?: Record<string, string> | { get(name: string): string | null; [key: string]: unknown };
  body?: string | unknown;
  signal?: { aborted: boolean } | null;
  [key: string]: unknown;
};
type FetchResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  text(): Promise<string>;
  json(): Promise<unknown>;
  headers: { get(name: string): string | null; [key: string]: unknown };
  [key: string]: unknown;
};

/**
 * Runtime Adapter provides abstraction over sandbox Runtime API
 * All external operations (fetch, env, fs) should go through this adapter
 */
export interface RuntimeAdapter {
  /**
   * Whitelisted fetch function from sandbox runtime
   * Only allows requests to whitelisted domains
   */
  fetch: (input: FetchInput, init?: FetchInit) => Promise<FetchResponse>;

  /**
   * Filtered environment variable accessor
   * Only allows access to whitelisted environment variables
   */
  env: {
    get(key: string): string | undefined;
  };

  /**
   * Restricted filesystem accessor
   * Only allows access to whitelisted paths
   */
  fs: {
    readFile(path: string, encoding?: string): Promise<string>;
    writeFile(path: string, data: string, encoding?: string): Promise<void>;
    mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
    exists(path: string): Promise<boolean>;
  };

  /**
   * Analytics SDK for tracking metrics and events
   */
  analytics?: {
    track(event: string, properties?: Record<string, unknown>): void;
    metric(name: string, value: number, tags?: Record<string, string>): void;
  };

  /**
   * Logger for structured logging
   */
  log?: (
    level: 'debug' | 'info' | 'warn' | 'error',
    msg: string,
    meta?: Record<string, unknown>,
  ) => void;
}

/**
 * Create a RuntimeAdapter from ExecutionContext runtime
 * Used in handlers to create adapter for engine
 */
export function createRuntimeAdapter(
  runtime?: {
    fetch?: (input: FetchInput, init?: FetchInit) => Promise<FetchResponse>;
    fs?: any;
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
  },
): RuntimeAdapter {
  // Fallback to global APIs if runtime not provided (for CLI mode)
  let fetchFn: (input: FetchInput, init?: FetchInit) => Promise<FetchResponse>;
  if (runtime?.fetch) {
    fetchFn = runtime.fetch as (input: FetchInput, init?: FetchInit) => Promise<FetchResponse>;
  } else if (typeof fetch !== 'undefined') {
    // Wrap global fetch to match our type signature
    fetchFn = async (input: FetchInput, init?: FetchInit): Promise<FetchResponse> => {
      const url = typeof input === 'string' ? input : 'url' in input ? input.url : input.href;
      const response = await fetch(url, init as any);
      return response as unknown as FetchResponse;
    };
  } else {
    throw new Error('fetch is not available. Provide runtime.fetch or ensure fetch is available globally.');
  }
  const envFn = runtime?.env ?? ((key: string) => {
    if (typeof process !== 'undefined' && process.env) {
      return process.env[key];
    }
    return undefined;
  });
  const logFn = runtime?.log;
  const analyticsFn = runtime?.analytics;

  return {
    fetch: fetchFn,
    env: {
      get: envFn,
    },
    fs: {
      readFile: async (path: string, encoding: string = 'utf8') => {
        if (runtime?.fs?.readFile) {
          return runtime.fs.readFile(path, encoding);
        }
        // Fallback for CLI mode
        const { readFile } = await import('fs/promises');
        return readFile(path, encoding as BufferEncoding);
      },
      writeFile: async (path: string, data: string, encoding: string = 'utf8') => {
        if (runtime?.fs?.writeFile) {
          return runtime.fs.writeFile(path, data, encoding);
        }
        // Fallback for CLI mode
        const { writeFile } = await import('fs/promises');
        return writeFile(path, data, encoding as BufferEncoding);
      },
      mkdir: async (path: string, options?: { recursive?: boolean }) => {
        if (runtime?.fs?.mkdir) {
          return runtime.fs.mkdir(path, options);
        }
        // Fallback for CLI mode
        const { mkdir } = await import('fs/promises');
        return mkdir(path, { recursive: options?.recursive ?? true });
      },
      exists: async (path: string) => {
        if (runtime?.fs?.exists) {
          return runtime.fs.exists(path);
        }
        // Fallback for CLI mode
        try {
          const { access } = await import('fs/promises');
          await access(path);
          return true;
        } catch {
          return false;
        }
      },
    },
    analytics: analyticsFn,
    log: logFn,
  };
}

