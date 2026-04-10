/**
 * @module @kb-labs/shared-command-kit/errors/format-validation
 * User-friendly formatting for flag validation errors
 */

import type { FlagValidationError, StringFlagSchema } from '../flags/types';
import type { FlagSchemaDefinition } from '../flags/types';

/**
 * Format a validation error into a user-friendly message
 *
 * @example
 * ```
 * ❌ Missing required flag: --text
 *
 * Usage: kb mind rag-query --text <query>
 * Hint: Try kb mind rag-query --help
 * ```
 */
export function formatValidationError(
  error: FlagValidationError,
  options: {
    commandName?: string;
    schema?: FlagSchemaDefinition;
  } = {}
): string {
  const { commandName, schema } = options;
  const lines: string[] = [];

  // Main error message with emoji
  const errorMsg = error.message;

  // Determine error type and format accordingly
  if (errorMsg.includes('is required')) {
    lines.push(`❌ Missing required flag: --${error.flag}`);
  } else if (errorMsg.includes('must be one of')) {
    // Extract the invalid value if available
    const valueStr = error.value !== undefined ? ` ${error.value}` : '';
    lines.push(`❌ Invalid value for --${error.flag}:${valueStr}`);
  } else if (errorMsg.includes('must be a')) {
    lines.push(`❌ Invalid type for --${error.flag}`);
  } else if (errorMsg.includes('conflicts with')) {
    lines.push(`❌ Flag conflict: --${error.flag}`);
  } else if (errorMsg.includes('depends on')) {
    lines.push(`❌ Missing dependency for --${error.flag}`);
  } else {
    // Fallback: use the original message
    lines.push(`❌ ${errorMsg}`);
  }

  lines.push(''); // Empty line for spacing

  // Generate usage hint if we have schema and command name
  if (commandName && schema) {
    const usageLine = generateUsageLine(commandName, schema, error.flag);
    if (usageLine) {
      lines.push(`Usage: ${usageLine}`);
    }
  }

  // Add help hint
  if (commandName) {
    lines.push(`Hint: Try ${commandName} --help`);
  } else {
    lines.push('Hint: Try --help for more information');
  }

  return lines.join('\n');
}

/**
 * Generate a usage line from command name and schema
 *
 * @example
 * generateUsageLine('kb mind rag-query', schema, 'text')
 * // Returns: 'kb mind rag-query --text <query> [options]'
 */
function generateUsageLine(
  commandName: string,
  schema: FlagSchemaDefinition,
  errorFlag: string
): string {
  const parts: string[] = [commandName];

  // Add the flag that caused the error first
  const errorFlagSchema = schema[errorFlag];
  if (errorFlagSchema) {
    const flagStr = formatFlagForUsage(errorFlag, errorFlagSchema);
    parts.push(flagStr);
  }

  // Check if there are other required flags
  const otherRequiredFlags = Object.entries(schema)
    .filter(([name, flagSchema]) =>
      name !== errorFlag && flagSchema.required
    );

  if (otherRequiredFlags.length > 0) {
    // Add other required flags
    for (const [name, flagSchema] of otherRequiredFlags) {
      parts.push(formatFlagForUsage(name, flagSchema));
    }
  }

  // Add [options] if there are optional flags
  const hasOptionalFlags = Object.values(schema).some(s => !s.required);
  if (hasOptionalFlags) {
    parts.push('[options]');
  }

  return parts.join(' ');
}

/**
 * Format a single flag for usage display
 *
 * @example
 * formatFlagForUsage('text', { type: 'string', required: true })
 * // Returns: '--text <text>'
 *
 * formatFlagForUsage('mode', { type: 'string', choices: ['local', 'auto'] })
 * // Returns: '[--mode <local|auto>]'
 */
function formatFlagForUsage(
  name: string,
  schema: FlagSchemaDefinition[string]
): string {
  let valueHint: string;

  if ('choices' in schema && (schema as StringFlagSchema).choices && (schema as StringFlagSchema).choices!.length > 0) {
    // Show choices: <local|auto>
    valueHint = `<${(schema as StringFlagSchema).choices!.join('|')}>`;
  } else if (schema.type === 'boolean') {
    // Boolean flags don't need a value hint
    return schema.required ? `--${name}` : `[--${name}]`;
  } else {
    // Generic type hint: <text>, <number>, etc.
    valueHint = `<${name}>`;
  }

  const flagPart = `--${name} ${valueHint}`;

  return schema.required ? flagPart : `[${flagPart}]`;
}
