/**
 * @module @kb-labs/core-sandbox/extensions/registry
 * Extension registry for runtime capabilities
 */

/**
 * Extension registry interface
 */
export interface ExtensionRegistry {
  register<T>(name: string, extension: T): void;
  get<T>(name: string): T | undefined;
  has(name: string): boolean;
  remove(name: string): void;
}

/**
 * Create extension registry
 */
export function createExtensionRegistry(): ExtensionRegistry {
  const extensions = new Map<string, unknown>();
  
  return {
    register(name, extension) {
      extensions.set(name, extension);
    },
    get(name) {
      return extensions.get(name) as any;
    },
    has(name) {
      return extensions.has(name);
    },
    remove(name) {
      extensions.delete(name);
    },
  };
}

/**
 * Predefined extension names (for future use)
 */
export const EXTENSION_NAMES = {
  RATE_LIMITER: 'rate-limiter',
  CIRCUIT_BREAKER: 'circuit-breaker',
  CACHE: 'cache',
  METRICS: 'metrics',
} as const;





