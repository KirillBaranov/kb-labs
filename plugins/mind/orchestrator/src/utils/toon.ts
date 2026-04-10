/**
 * TOON (Token-Oriented Object Notation) utilities
 *
 * TOON is a compact, human-readable encoding optimized for LLMs.
 * Saves ~40% tokens compared to JSON.
 *
 * @see https://github.com/toon-format/toon
 */

/**
 * Convert array of objects to TOON format
 *
 * Example:
 * Input: [{ id: 1, name: "foo" }, { id: 2, name: "bar" }]
 * Output:
 * ```
 * [2]{id,name}:
 *   1,foo
 *   2,bar
 * ```
 */
export function arrayToToon<T extends Record<string, any>>(
  array: T[],
  fields?: (keyof T)[],
): string {
  if (array.length === 0) {
    return '[0]';
  }

  // Auto-detect fields from first object if not provided
  const firstItem = array[0];
  if (!firstItem) {
    return '[0]';
  }
  const fieldNames = fields ?? (Object.keys(firstItem) as (keyof T)[]);

  // Header: [count]{field1,field2,...}:
  const header = `[${array.length}]{${fieldNames.join(',')}}:`;

  // Rows: value1,value2,...
  const rows = array.map(obj => {
    return fieldNames.map(field => {
      const value = obj[field];

      // Handle different types
      if (value === null || value === undefined) {
        return '';
      }
      if (typeof value === 'string') {
        // Escape commas and newlines
        return value.replace(/,/g, '\\,').replace(/\n/g, '\\n');
      }
      return String(value);
    }).join(',');
  });

  return `${header}\n  ${rows.join('\n  ')}`;
}

/**
 * Convert object to TOON format
 *
 * Example:
 * Input: { name: "foo", count: 42, items: [{id: 1}, {id: 2}] }
 * Output:
 * ```
 * name: foo
 * count: 42
 * items[2]{id}:
 *   1
 *   2
 * ```
 */
export function objectToToon(obj: Record<string, any>, indent = 0): string {
  const prefix = '  '.repeat(indent);
  const lines: string[] = [];

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      lines.push(`${prefix}${key}:`);
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${prefix}${key}[0]`);
      } else if (typeof value[0] === 'object' && value[0] !== null) {
        // Array of objects - use table format
        const toon = arrayToToon(value);
        lines.push(`${prefix}${key}${toon.split('\n').map((line, i) => i === 0 ? line : prefix + line).join('\n')}`);
      } else {
        // Array of primitives
        lines.push(`${prefix}${key}[${value.length}]: ${value.join(', ')}`);
      }
    } else if (typeof value === 'object') {
      // Nested object
      lines.push(`${prefix}${key}:`);
      lines.push(objectToToon(value, indent + 1));
    } else {
      // Primitive value
      lines.push(`${prefix}${key}: ${value}`);
    }
  }

  return lines.join('\n');
}

/**
 * Estimate token count savings using TOON vs JSON
 *
 * Rough estimate: TOON saves ~40% tokens for typical structured data
 */
export function estimateTokenSavings(jsonString: string): {
  jsonTokens: number;
  toonTokens: number;
  savingsPercent: number;
} {
  // Rough token estimation: ~4 chars per token
  const jsonTokens = Math.ceil(jsonString.length / 4);
  const toonTokens = Math.ceil(jsonTokens * 0.6); // ~40% savings
  const savingsPercent = Math.round(((jsonTokens - toonTokens) / jsonTokens) * 100);

  return { jsonTokens, toonTokens, savingsPercent };
}
