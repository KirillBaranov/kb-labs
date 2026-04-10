/**
 * Environment variable system for declarative env definition with type safety
 *
 * Usage:
 * ```typescript
 * // In contracts
 * export const myEnv = defineEnv({
 *   MY_API_KEY: { type: 'string', description: 'API key for service' },
 *   MY_ENABLED: { type: 'boolean', default: true },
 *   MY_TIMEOUT: { type: 'number', default: 5000 },
 * });
 *
 * // In command
 * export default defineCommand({
 *   handler: {
 *     async execute(ctx, input) {
 *       const env = myEnv.parse(ctx.runtime);
 *       console.log(env.MY_API_KEY); // string | undefined
 *       console.log(env.MY_ENABLED); // boolean
 *     }
 *   }
 * });
 * ```
 */

import {
  type FlagSpec,
  type FlagsSchema,
  type InferFlagsType,
  parseBoolean,
  parseString,
  parseNumber,
} from './flags.js';

/**
 * Runtime API interface (minimal for env parsing)
 * Avoids dependency on @kb-labs/plugin-contracts
 */
export interface RuntimeLike {
  env(key: string): string | undefined;
}

// ============================================================================
// Types
// ============================================================================

/**
 * Environment variable schema (reuses FlagSpec types)
 */
export type EnvSchema = FlagsSchema;

/**
 * Environment variable definition with parse method
 */
export interface EnvDefinition<T extends EnvSchema> {
  /** Schema for documentation and validation */
  schema: T;
  /** Inferred TypeScript type */
  type: InferFlagsType<T>;
  /** Parse environment variables from RuntimeLike */
  parse: (runtime: RuntimeLike) => InferFlagsType<T>;
}

// ============================================================================
// defineEnv - main API
// ============================================================================

/**
 * Define environment variables with type safety and validation
 *
 * @example
 * ```typescript
 * export const commitEnv = defineEnv({
 *   KB_COMMIT_LLM_ENABLED: {
 *     type: 'boolean',
 *     default: true,
 *     description: 'Enable LLM analysis',
 *   },
 *   KB_COMMIT_LLM_TEMPERATURE: {
 *     type: 'number',
 *     default: 0.3,
 *     description: 'LLM temperature (0-1)',
 *     validate: (v) => {
 *       if (v < 0 || v > 1) throw new Error('Must be 0-1');
 *     },
 *   },
 * });
 *
 * // Use in command
 * const env = commitEnv.parse(ctx.runtime);
 * // Type: { KB_COMMIT_LLM_ENABLED: boolean; KB_COMMIT_LLM_TEMPERATURE: number }
 * ```
 */
export function defineEnv<T extends EnvSchema>(schema: T): EnvDefinition<T> {
  return {
    schema,
    type: {} as InferFlagsType<T>,
    parse: (runtime: RuntimeLike) => parseEnvFromRuntime(runtime, schema),
  };
}

// ============================================================================
// Runtime parsing
// ============================================================================

/**
 * Parse environment variables from RuntimeLike with validation and defaults
 */
export function parseEnvFromRuntime<T extends EnvSchema>(
  runtime: RuntimeLike,
  schema: T
): InferFlagsType<T> {
  const result: any = {};

  for (const [key, spec] of Object.entries(schema)) {
    const rawValue = runtime.env(key);

    // Apply default if undefined
    if (rawValue === undefined) {
      if ('default' in spec) {
        result[key] = spec.default;
      }
      continue;
    }

    // Parse based on type (reuse parsers from flags)
    result[key] = parseEnvValue(rawValue, key, spec);
  }

  return result;
}

/**
 * Parse single env value with type validation
 */
function parseEnvValue(value: string | undefined, key: string, spec: FlagSpec): any {
  if (value === undefined) {
    return undefined;
  }

  switch (spec.type) {
    case 'boolean':
      return parseBoolean(value, key);

    case 'string':
      const strValue = parseString(value, key);
      // Custom validation for string
      if (spec.validate) {
        spec.validate(strValue);
      }
      return strValue;

    case 'number':
      const numValue = parseNumber(value, key);
      // Custom validation for number
      if (spec.validate) {
        spec.validate(numValue);
      }
      return numValue;

    default:
      return value;
  }
}
