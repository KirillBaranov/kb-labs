/**
 * Field Checker
 *
 * Verifies that fields/parameters mentioned in LLM answers
 * actually exist in the source code. Catches hallucinated parameters.
 */

import type { AgentWarning } from '../types';
import type { MindChunk } from '@kb-labs/mind-types';

export interface FieldCheckResult {
  verified: string[];
  unverified: string[];
  confidence: number;
  warnings: AgentWarning[];
}

export interface FieldCheckerOptions {
  /** Minimum confidence to consider answer reliable */
  minConfidence?: number;
  /** Fields to ignore (common words that look like fields) */
  ignoreFields?: string[];
}

const DEFAULT_OPTIONS: Required<FieldCheckerOptions> = {
  minConfidence: 0.7,
  ignoreFields: [
    // Common words that look like params
    'type', 'name', 'value', 'data', 'item', 'index', 'key',
    'true', 'false', 'null', 'undefined', 'string', 'number',
    'object', 'array', 'function', 'class', 'interface',
    // Common method names
    'get', 'set', 'add', 'remove', 'update', 'delete', 'create',
    'find', 'filter', 'map', 'reduce', 'forEach', 'sort',
  ],
};

// Patterns to extract field mentions from answer
const FIELD_PATTERNS = [
  // `fieldName` - backtick references
  /`(\w+)`/g,
  // fieldName: - TypeScript/object fields
  /(\w+):\s*(?:string|number|boolean|object|any|\[|\{|`)/g,
  // parameter fieldName, option fieldName
  /(?:parameter|param|option|field|property|prop)\s+[`"]?(\w+)[`"]?/gi,
  // the fieldName parameter/option
  /the\s+[`"]?(\w+)[`"]?\s+(?:parameter|option|field|property)/gi,
  // --flagName (CLI flags)
  /--(\w+)/g,
];

// Patterns that indicate a field is a generic reference, not specific
const GENERIC_PATTERNS = [
  /^[a-z]$/,           // Single letter
  /^_+$/,              // Only underscores
  /^\d+$/,             // Only numbers
  /^[A-Z_]+$/,         // ALL_CAPS constants (often not fields)
];

/**
 * Field Checker - validates mentioned fields exist in sources
 */
export class FieldChecker {
  private readonly options: Required<FieldCheckerOptions>;
  private readonly ignoreSet: Set<string>;

  constructor(options: FieldCheckerOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.ignoreSet = new Set(this.options.ignoreFields.map(f => f.toLowerCase()));
  }

  /**
   * Check all fields mentioned in an answer against source chunks
   */
  check(answer: string, chunks: MindChunk[]): FieldCheckResult {
    const mentionedFields = this.extractFields(answer);
    const verified: string[] = [];
    const unverified: string[] = [];
    const warnings: AgentWarning[] = [];

    // Build searchable text from all chunks
    const sourceText = chunks.map(c => c.text).join('\n');
    const sourceLower = sourceText.toLowerCase();

    for (const field of mentionedFields) {
      if (this.fieldExistsInSource(field, sourceLower, sourceText)) {
        verified.push(field);
      } else {
        unverified.push(field);
      }
    }

    // Calculate confidence with softer penalties
    // Unverified fields reduce confidence but don't zero it out
    // This is more forgiving since LLM may reference fields from broader context
    const totalFields = verified.length + unverified.length;
    if (totalFields === 0) {
      // No fields mentioned - full confidence
      return { verified, unverified, confidence: 1, warnings };
    }

    // Base confidence from verification rate, but with floor
    const verificationRate = verified.length / totalFields;
    // Apply soft penalty: max 40% reduction for unverified fields
    const confidence = Math.max(0.6, verificationRate * 0.4 + 0.6);

    // Generate warnings for unverified fields
    if (unverified.length > 0) {
      warnings.push({
        code: 'UNVERIFIED_FIELD',
        message: `Fields mentioned but not found in sources: ${unverified.join(', ')}`,
        details: {
          field: unverified.join(', '),
        },
      });
    }

    return {
      verified,
      unverified,
      confidence,
      warnings,
    };
  }

  /**
   * Extract field/parameter names from answer text
   */
  extractFields(answer: string): string[] {
    const fields = new Set<string>();

    for (const pattern of FIELD_PATTERNS) {
      // Reset regex state
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = pattern.exec(answer)) !== null) {
        const field = match[1];
        if (field && this.isValidField(field)) {
          fields.add(field);
        }
      }
    }

    return Array.from(fields);
  }

  /**
   * Check if a field name is valid (not ignored, not generic)
   */
  private isValidField(field: string): boolean {
    // Check ignore list
    if (this.ignoreSet.has(field.toLowerCase())) {
      return false;
    }

    // Check generic patterns
    for (const pattern of GENERIC_PATTERNS) {
      if (pattern.test(field)) {
        return false;
      }
    }

    // Must be at least 2 characters
    if (field.length < 2) {
      return false;
    }

    return true;
  }

  /**
   * Check if field exists in source text
   */
  private fieldExistsInSource(
    field: string,
    sourceLower: string,
    sourceOriginal: string,
  ): boolean {
    const fieldLower = field.toLowerCase();

    // Exact match in source
    if (sourceLower.includes(fieldLower)) {
      return true;
    }

    // Check for camelCase/snake_case variations
    const snakeCase = this.toSnakeCase(field);
    const camelCase = this.toCamelCase(field);

    if (sourceLower.includes(snakeCase.toLowerCase())) {
      return true;
    }

    if (sourceOriginal.includes(camelCase)) {
      return true;
    }

    // Check for field as property: fieldName:, fieldName =, .fieldName
    const propertyPatterns = [
      new RegExp(`\\b${fieldLower}\\s*:`, 'i'),
      new RegExp(`\\b${fieldLower}\\s*=`, 'i'),
      new RegExp(`\\.${fieldLower}\\b`, 'i'),
      new RegExp(`['"]${fieldLower}['"]`, 'i'),
    ];

    for (const pattern of propertyPatterns) {
      if (pattern.test(sourceOriginal)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Convert to snake_case
   */
  private toSnakeCase(str: string): string {
    return str
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .toLowerCase();
  }

  /**
   * Convert to camelCase
   */
  private toCamelCase(str: string): string {
    return str
      .replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
      .replace(/^([A-Z])/, (_, letter) => letter.toLowerCase());
  }
}

/**
 * Quick check if an answer likely contains hallucinated fields
 */
export function hasLikelyHallucinations(
  answer: string,
  chunks: MindChunk[],
  threshold = 0.7,
): boolean {
  const checker = new FieldChecker();
  const result = checker.check(answer, chunks);
  return result.confidence < threshold;
}

export function createFieldChecker(options?: FieldCheckerOptions): FieldChecker {
  return new FieldChecker(options);
}
