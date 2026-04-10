/**
 * Flag system for declarative CLI flag definition with type safety
 *
 * Usage:
 * ```typescript
 * // In contracts
 * export const myFlags = defineFlags({
 *   scope: { type: 'string', description: 'Filter by scope' },
 *   verbose: { type: 'boolean', default: false },
 * });
 *
 * // In command
 * export default defineCommand({
 *   flags: myFlags,
 *   handler: {
 *     async execute(ctx, input: typeof myFlags.type) {
 *       const { scope, verbose } = input;
 *     }
 *   }
 * });
 * ```
 */

// ============================================================================
// Types
// ============================================================================

export type FlagType = 'string' | 'boolean' | 'number';

export interface BaseFlagSpec<T extends FlagType> {
  type: T;
  description?: string;
  examples?: string[];
  deprecated?: boolean | string;
}

export interface StringFlagSpec extends BaseFlagSpec<'string'> {
  default?: string;
  validate?: (value: string) => void | Promise<void>;
}

export interface BooleanFlagSpec extends BaseFlagSpec<'boolean'> {
  default?: boolean;
}

export interface NumberFlagSpec extends BaseFlagSpec<'number'> {
  default?: number;
  validate?: (value: number) => void | Promise<void>;
}

export type FlagSpec = StringFlagSpec | BooleanFlagSpec | NumberFlagSpec;

export type FlagsSchema = Record<string, FlagSpec>;

// ============================================================================
// Type inference
// ============================================================================

type InferFlagType<T extends FlagSpec> =
  T extends StringFlagSpec
    ? T extends { default: string } ? string : string | undefined
    : T extends BooleanFlagSpec
    ? T extends { default: boolean } ? boolean : boolean | undefined
    : T extends NumberFlagSpec
    ? T extends { default: number } ? number : number | undefined
    : never;

export type InferFlagsType<T extends FlagsSchema> = {
  [K in keyof T]: InferFlagType<T[K]>;
};

// ============================================================================
// defineFlags - main API
// ============================================================================

export interface FlagsDefinition<T extends FlagsSchema> {
  /** Schema for manifest */
  schema: T;
  /** Inferred TypeScript type */
  type: InferFlagsType<T>;
  /** Parse and validate flags from raw input */
  parse: (input: unknown) => InferFlagsType<T>;
}

/**
 * Define CLI flags with type safety and validation
 *
 * @example
 * ```typescript
 * export const commitFlags = defineFlags({
 *   scope: {
 *     type: 'string',
 *     description: 'Limit to package or path',
 *     examples: ['@kb-labs/core', 'packages/**'],
 *   },
 *   'dry-run': {
 *     type: 'boolean',
 *     description: 'Preview without applying',
 *     default: false,
 *   },
 * });
 *
 * // Use in command
 * type MyInput = typeof commitFlags.type;
 * // Result: { scope?: string; 'dry-run': boolean }
 * ```
 */
export function defineFlags<T extends FlagsSchema>(schema: T): FlagsDefinition<T> {
  return {
    schema,
    type: {} as InferFlagsType<T>,
    parse: (input: unknown) => parseFlagsFromInput(input, schema),
  };
}

// ============================================================================
// Runtime parsing and validation
// ============================================================================

/**
 * Parse flags from raw input with type validation and defaults
 */
export function parseFlagsFromInput<T extends FlagsSchema>(
  input: unknown,
  schema: T
): InferFlagsType<T> {
  const result: any = {};
  const rawInput = input as Record<string, unknown>;

  for (const [key, spec] of Object.entries(schema)) {
    const value = rawInput?.[key];

    // Apply default if value is undefined
    if (value === undefined) {
      if ('default' in spec) {
        result[key] = spec.default;
      }
      continue;
    }

    // Type validation and coercion
    switch (spec.type) {
      case 'boolean':
        result[key] = parseBoolean(value, key);
        break;
      case 'string':
        result[key] = parseString(value, key);
        // Custom validation for string
        if (spec.validate && result[key] !== undefined) {
          spec.validate(result[key]);
        }
        break;
      case 'number':
        result[key] = parseNumber(value, key);
        // Custom validation for number
        if (spec.validate && result[key] !== undefined) {
          spec.validate(result[key]);
        }
        break;
    }
  }

  return result;
}

// ============================================================================
// Type parsers (exported for reuse in env.ts)
// ============================================================================

export function parseBoolean(value: unknown, flagName: string): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower === 'true' || lower === '1' || lower === 'yes') {return true;}
    if (lower === 'false' || lower === '0' || lower === 'no') {return false;}
  }

  throw new Error(
    `Flag "${flagName}" must be boolean, got ${typeof value}. ` +
    `Use true/false or 1/0 or yes/no.`
  );
}

export function parseString(value: unknown, flagName: string): string {
  if (typeof value === 'string') {
    return value;
  }

  // Coerce number to string
  if (typeof value === 'number') {
    return String(value);
  }

  throw new Error(
    `Flag "${flagName}" must be string, got ${typeof value}.`
  );
}

export function parseNumber(value: unknown, flagName: string): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`Flag "${flagName}" must be finite number, got ${value}.`);
    }
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      throw new Error(
        `Flag "${flagName}" must be number, got invalid string "${value}".`
      );
    }
    return parsed;
  }

  throw new Error(
    `Flag "${flagName}" must be number, got ${typeof value}.`
  );
}

// ============================================================================
// Legacy helper (keep for backward compatibility)
// ============================================================================

export function parseNumberFlag(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return undefined;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

// ============================================================================
// Utility: Merge input.flags into input (for V3 compatibility)
// ============================================================================

/**
 * Merge input.flags into input root (V3 compatibility helper)
 *
 * @example
 * ```typescript
 * const raw = { scope: 'old', flags: { scope: 'new', json: true } };
 * const merged = mergeFlags(raw);
 * // Result: { scope: 'new', json: true, flags: {...} }
 * ```
 */
export function mergeFlags<T extends Record<string, unknown>>(input: T): T {
  if (!input.flags || typeof input.flags !== 'object') {
    return input;
  }

  // Merge: root values first, then flags override
  return { ...input, ...input.flags };
}
