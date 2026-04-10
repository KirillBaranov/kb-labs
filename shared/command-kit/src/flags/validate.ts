/**
 * @module @kb-labs/shared-command-kit/flags/validate
 * Validate flags against schema
 */

import {
  FlagValidationError,
  type FlagSchema,
  type FlagSchemaDefinition,
  type SafeValidationResult,
} from './types';
import type { InferFlags } from './define';

/**
 * Parse and coerce flag value based on type
 */
function coerceValue(value: unknown, type: FlagSchema['type']): unknown {
  if (value === undefined || value === null) {
    return value;
  }

  switch (type) {
    case 'boolean':
      if (typeof value === 'boolean') {
        return value;
      }
      if (typeof value === 'string') {
        const lower = value.toLowerCase().trim();
        if (lower === 'true' || lower === '1' || lower === 'yes') {
          return true;
        }
        if (lower === 'false' || lower === '0' || lower === 'no' || lower === '') {
          return false;
        }
      }
      return Boolean(value);

    case 'number':
      if (typeof value === 'number') {
        return value;
      }
      if (typeof value === 'string') {
        const parsed = Number(value);
        if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
          return parsed;
        }
      }
      return Number(value);

    case 'array':
      if (Array.isArray(value)) {
        return value;
      }
      if (typeof value === 'string') {
        return value.split(',').map((item) => item.trim());
      }
      return [value];

    case 'string':
      return String(value);

    default:
      return value;
  }
}

/**
 * Validate a single flag value against its schema
 */
async function validateFlag(
  flagName: string,
  value: unknown,
  schema: FlagSchema
): Promise<true | string> {
  const { type, required } = schema;
  
  // Type-specific properties (using type guards)
  const choices = 'choices' in schema ? schema.choices : undefined;
  const pattern = 'pattern' in schema ? schema.pattern : undefined;
  const min = 'min' in schema ? schema.min : undefined;
  const max = 'max' in schema ? schema.max : undefined;
  const validate = 'validate' in schema ? schema.validate : undefined;
  const minLength = 'minLength' in schema ? schema.minLength : undefined;
  const maxLength = 'maxLength' in schema ? schema.maxLength : undefined;
  const items = 'items' in schema ? schema.items : undefined;
  const transform = 'transform' in schema ? schema.transform : undefined;

  // Check required
  if (required && (value === undefined || value === null || value === '')) {
    return `Flag --${flagName} is required`;
  }

  // Skip validation if value is undefined and not required
  if (value === undefined || value === null) {
    return true;
  }

  // Coerce value to correct type
  const coerced = coerceValue(value, type);

  // Type-specific validation
  switch (type) {
    case 'boolean':
      if (typeof coerced !== 'boolean') {
        return `Flag --${flagName} must be a boolean`;
      }
      break;

    case 'string':
      if (typeof coerced !== 'string') {
        return `Flag --${flagName} must be a string`;
      }
      if (minLength !== undefined && coerced.length < minLength) {
        return `Flag --${flagName} must be at least ${minLength} characters long`;
      }
      if (maxLength !== undefined && coerced.length > maxLength) {
        return `Flag --${flagName} must be at most ${maxLength} characters long`;
      }
      if (choices && !choices.includes(coerced)) {
        return `Flag --${flagName} must be one of: ${choices.join(', ')} (got: ${coerced})`;
      }
      if (pattern && !pattern.test(coerced)) {
        return `Flag --${flagName} must match pattern ${pattern.toString()}`;
      }
      if (validate) {
        const stringValidate = validate as (value: string) => true | string | Promise<true | string>;
        const result = await stringValidate(coerced as string);
        if (result !== true) {
          return result;
        }
      }
      break;

    case 'number':
      if (typeof coerced !== 'number' || !Number.isFinite(coerced)) {
        return `Flag --${flagName} must be a number`;
      }
      if (min !== undefined && coerced < min) {
        return `Flag --${flagName} must be >= ${min} (got: ${coerced})`;
      }
      if (max !== undefined && coerced > max) {
        return `Flag --${flagName} must be <= ${max} (got: ${coerced})`;
      }
      if (validate) {
        const numberValidate = validate as (value: number) => true | string | Promise<true | string>;
        const result = await numberValidate(coerced as number);
        if (result !== true) {
          return result;
        }
      }
      break;

    case 'array':
      if (!Array.isArray(coerced)) {
        return `Flag --${flagName} must be an array`;
      }
      if (minLength !== undefined && coerced.length < minLength) {
        return `Flag --${flagName} must have at least ${minLength} items`;
      }
      if (maxLength !== undefined && coerced.length > maxLength) {
        return `Flag --${flagName} must have at most ${maxLength} items`;
      }
      if (items) {
        for (let i = 0; i < coerced.length; i++) {
          const item = coerced[i];
          if (items === 'string' && typeof item !== 'string') {
            return `Flag --${flagName}[${i}] must be a string`;
          }
          if (items === 'number' && typeof item !== 'number') {
            return `Flag --${flagName}[${i}] must be a number`;
          }
          if (items === 'boolean' && typeof item !== 'boolean') {
            return `Flag --${flagName}[${i}] must be a boolean`;
          }
        }
      }
      break;
  }

  return true;
}

/**
 * Validate flags against schema and return typed result
 *
 * @throws {FlagValidationError} If validation fails and safe mode is not used
 */
export async function validateFlags<T extends FlagSchemaDefinition>(
  rawFlags: Record<string, unknown>,
  schemaDefinition: { schema: T } | T
): Promise<InferFlags<T>> {
  const schema = 'schema' in schemaDefinition ? schemaDefinition.schema : schemaDefinition;
  const errors: Array<{ flag: string; message: string; value?: unknown }> = [];
  const result: Record<string, unknown> = {};
  const flagValues: Record<string, unknown> = { ...rawFlags };

  // First pass: apply implies
  for (const [flagName, flagSchema] of Object.entries(schema)) {
    const value = flagValues[flagName];
    if (value !== undefined && value !== null && value !== false && value !== '') {
      const implies = flagSchema.implies;
      if (implies) {
        for (const implied of implies) {
          if (Array.isArray(implied) && implied.length === 2) {
            // [flagName, value] format
            const [impliedFlag, impliedValue] = implied;
            if (flagValues[impliedFlag] === undefined) {
              flagValues[impliedFlag] = impliedValue;
            }
          } else if (typeof implied === 'string') {
            // Just flag name - set to true
            if (flagValues[implied] === undefined) {
              flagValues[implied] = true;
            }
          }
        }
      }
    }
  }

  // Second pass: validate each flag
  for (const [flagName, flagSchema] of Object.entries(schema)) {
    const value = flagValues[flagName];
    const schemaWithName: FlagSchema = { ...flagSchema, name: flagName };

    // Check conflicts
    const conflicts = flagSchema.conflicts;
    if (conflicts && value !== undefined && value !== null && value !== false && value !== '') {
      for (const conflictingFlag of conflicts) {
        const conflictingValue = flagValues[conflictingFlag];
        if (conflictingValue !== undefined && conflictingValue !== null && conflictingValue !== false && conflictingValue !== '') {
          errors.push({
            flag: flagName,
            message: `Flag --${flagName} conflicts with --${conflictingFlag}`,
            value,
          });
          break;
        }
      }
      if (errors.some(e => e.flag === flagName)) {
        continue;
      }
    }

    // Check dependsOn
    const dependsOn = flagSchema.dependsOn;
    if (dependsOn && value !== undefined && value !== null && value !== '') {
      for (const dependency of dependsOn) {
        const dependencyValue = flagValues[dependency];
        if (dependencyValue === undefined || dependencyValue === null || dependencyValue === '') {
          errors.push({
            flag: flagName,
            message: `Flag --${flagName} depends on --${dependency}`,
            value,
          });
          break;
        }
      }
      if (errors.some(e => e.flag === flagName)) {
        continue;
      }
    }

    // Check required
    if (flagSchema.required && (value === undefined || value === null || value === '')) {
      errors.push({
        flag: flagName,
        message: `Flag --${flagName} is required`,
        value,
      });
      continue;
    }

    // Apply default if value is missing
    const finalValue = value !== undefined ? value : flagSchema.default;

    // Skip validation if value is undefined and not required
    if (finalValue === undefined && !flagSchema.required) {
      continue;
    }

    // Validate flag
    const validationResult = await validateFlag(flagName, finalValue, schemaWithName);
    if (validationResult !== true) {
      errors.push({
        flag: flagName,
        message: validationResult,
        value: finalValue,
      });
      continue;
    }

    // Apply transform if present
    let transformedValue = coerceValue(finalValue, flagSchema.type);
    const transform = flagSchema.transform;
    if (transform) {
      transformedValue = await transform(transformedValue);
    }

    // Store value
    result[flagName] = transformedValue;
  }

  // Check for unknown flags (optional - could be enabled via option)
  // for (const flagName of Object.keys(rawFlags)) {
  //   if (!(flagName in schema)) {
  //     errors.push({
  //       flag: flagName,
  //       message: `Unknown flag: --${flagName}`,
  //       value: rawFlags[flagName],
  //     });
  //   }
  // }

  if (errors.length > 0) {
    const firstError = errors[0]!;
    throw new FlagValidationError(
      firstError.flag,
      firstError.message,
      firstError.value,
      schema as FlagSchemaDefinition // Pass schema for usage generation
    );
  }

  return result as InferFlags<T>;
}

/**
 * Safe version of validateFlags that doesn't throw
 */
export async function validateFlagsSafe<T extends FlagSchemaDefinition>(
  rawFlags: Record<string, unknown>,
  schemaDefinition: { schema: T } | T
): Promise<SafeValidationResult<InferFlags<T>>> {
  try {
    const data = await validateFlags(rawFlags, schemaDefinition);
    return {
      success: true,
      data,
      errors: [],
    };
  } catch (error) {
    if (error instanceof FlagValidationError) {
      return {
        success: false,
        errors: [
          {
            flag: error.flag,
            message: error.message,
            value: error.value,
          },
        ],
      };
    }
    throw error;
  }
}

