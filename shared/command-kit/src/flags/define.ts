/**
 * @module @kb-labs/shared-command-kit/flags/define
 * Define flag schemas with automatic type inference
 */

import type {
  FlagSchemaDefinition,
  BooleanFlagSchema,
  StringFlagSchema,
  NumberFlagSchema,
  ArrayFlagSchema,
} from './types';

/**
 * Flag schema with type inference
 */
export interface FlagSchemaWithInfer<T extends FlagSchemaDefinition> {
  /** Original schema definition */
  readonly schema: T;
  /** Infer TypeScript type from schema */
  infer: InferFlags<T>;
}

/**
 * Infer TypeScript type from flag schema definition
 */
export type InferFlags<T extends FlagSchemaDefinition> = {
  [K in keyof T]: T[K] extends BooleanFlagSchema
    ? T[K]['default'] extends boolean
      ? boolean
      : T[K]['required'] extends true
        ? boolean
        : boolean | undefined
    : T[K] extends StringFlagSchema
      ? T[K]['choices'] extends readonly string[]
        ? T[K]['required'] extends true
          ? T[K]['choices'][number]
          : T[K]['default'] extends string
            ? T[K]['choices'][number]
            : T[K]['choices'][number] | undefined
        : T[K]['required'] extends true
          ? string
          : T[K]['default'] extends string
            ? string
            : string | undefined
      : T[K] extends NumberFlagSchema
        ? T[K]['required'] extends true
          ? number
          : T[K]['default'] extends number
            ? number
            : number | undefined
        : T[K] extends ArrayFlagSchema
          ? T[K]['items'] extends 'string'
            ? string[]
            : T[K]['items'] extends 'number'
              ? number[]
              : T[K]['items'] extends 'boolean'
                ? boolean[]
                : unknown[]
          : unknown;
};

/**
 * Define a flag schema with automatic type inference
 *
 * @example
 * ```typescript
 * const schema = defineFlags({
 *   scope: {
 *     type: 'string',
 *     required: true,
 *     pattern: /^[@a-z0-9-/]+$/i,
 *   },
 *   'dry-run': {
 *     type: 'boolean',
 *     default: false,
 *   },
 * });
 *
 * type Flags = typeof schema.infer;
 * // Flags = { scope: string; 'dry-run': boolean }
 * ```
 */
export function defineFlags<T extends FlagSchemaDefinition>(
  definition: T
): FlagSchemaWithInfer<T> {
  return {
    schema: definition,
    infer: {} as InferFlags<T>,
  };
}

