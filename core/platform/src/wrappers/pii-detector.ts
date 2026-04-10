/**
 * @module @kb-labs/core-platform/wrappers/pii-detector
 * PII detection and reversible masking for LLM privacy protection.
 *
 * Detects structured PII (emails, phones, IPs, API keys, etc.) via regex patterns.
 * Supports reversible masking: PII → placeholder before LLM, placeholder → PII in response.
 *
 * Extensible via IPIIDetector interface — swap RegexPIIDetector for NER-based
 * (Presidio, AWS Comprehend, Google DLP) without changing the wrapper.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface PIIMatch {
  /** Pattern name that matched (e.g., 'email', 'phone') */
  name: string;
  /** Matched value */
  value: string;
  /** Start index in original string */
  start: number;
  /** End index in original string */
  end: number;
}

export interface PIIRedactionResult {
  /** Text with PII replaced by placeholders */
  redacted: string;
  /** Map of placeholder → original value (for restoration) */
  placeholderMap: Map<string, string>;
}

export interface PIIDetectorConfig {
  /** Which pattern categories to enable */
  patterns?: PIIPatternCategory[];
  /** Custom regex patterns to add */
  customPatterns?: PIIPatternDef[];
  /** Values that should NOT be redacted (e.g., '*@company.com') */
  allowlist?: string[];
}

export type PIIPatternCategory =
  | 'email'
  | 'phone'
  | 'ip'
  | 'ssh-key'
  | 'api-key'
  | 'connection-string'
  | 'password';

export interface PIIPatternDef {
  name: string;
  pattern: RegExp;
}

/** Abstract detector — swap implementation without changing the wrapper. */
export interface IPIIDetector {
  detect(text: string): PIIMatch[];
  redact(text: string, prefix?: string): PIIRedactionResult;
  restore(text: string, placeholderMap: Map<string, string>): string;
}

// ── Built-in patterns ────────────────────────────────────────────────────────

const BUILTIN_PATTERNS: Record<PIIPatternCategory, PIIPatternDef[]> = {
  email: [
    { name: 'email', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  ],
  phone: [
    // E.164 and common formats: +1234567890, (123) 456-7890, 123-456-7890
    { name: 'phone', pattern: /\b\+?[1-9]\d{6,14}\b/g },
  ],
  ip: [
    { name: 'ipv4', pattern: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g },
  ],
  'ssh-key': [
    { name: 'ssh-key', pattern: /ssh-(?:rsa|ed25519|ecdsa)\s+[A-Za-z0-9+/=]{40,}/g },
  ],
  'api-key': [
    { name: 'openai-key', pattern: /sk-[A-Za-z0-9_-]{20,}/g },
    { name: 'anthropic-key', pattern: /sk-ant-[A-Za-z0-9_-]{20,}/g },
    { name: 'aws-access-key', pattern: /\bAKIA[0-9A-Z]{16}\b/g },
    { name: 'github-token', pattern: /\bgh[pousr]_[A-Za-z0-9]{36}\b/g },
    { name: 'generic-token', pattern: /(?:api[_-]?key|access[_-]?token|auth[_-]?token|bearer[_-]?token|secret[_-]?key)[^\n"']{0,20}["'\s=:]+([A-Za-z0-9_\-./+]{32,})/gi },
  ],
  'connection-string': [
    { name: 'mongodb-uri', pattern: /mongodb(?:\+srv)?:\/\/[^@\s]+@[^\s]+/g },
    { name: 'postgres-uri', pattern: /postgres(?:ql)?:\/\/[^@\s]+@[^\s]+/g },
    { name: 'mysql-uri', pattern: /mysql:\/\/[^@\s]+@[^\s]+/g },
  ],
  password: [
    { name: 'password', pattern: /(?:password|passwd|pwd)\s*[=:]\s*["']?[^"'\s]{4,}["']?/gi },
  ],
};

const DEFAULT_CATEGORIES: PIIPatternCategory[] = [
  'email', 'phone', 'ip', 'ssh-key', 'api-key', 'connection-string', 'password',
];

// ── RegexPIIDetector ─────────────────────────────────────────────────────────

export class RegexPIIDetector implements IPIIDetector {
  private readonly patterns: PIIPatternDef[];
  private readonly allowlistPatterns: RegExp[];

  constructor(config: PIIDetectorConfig = {}) {
    const categories = config.patterns ?? DEFAULT_CATEGORIES;

    // Collect patterns from enabled categories
    this.patterns = [];
    for (const cat of categories) {
      const defs = BUILTIN_PATTERNS[cat];
      if (defs) {
        this.patterns.push(...defs);
      }
    }

    // Add custom patterns
    if (config.customPatterns) {
      this.patterns.push(...config.customPatterns);
    }

    // Build allowlist regex patterns (supports wildcards like '*@company.com')
    this.allowlistPatterns = (config.allowlist ?? []).map((pattern) => {
      const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*');
      return new RegExp(`^${escaped}$`, 'i');
    });
  }

  private isAllowlisted(value: string): boolean {
    return this.allowlistPatterns.some((p) => p.test(value));
  }

  detect(text: string): PIIMatch[] {
    const matches: PIIMatch[] = [];
    const seen = new Set<string>(); // dedupe overlapping matches

    for (const def of this.patterns) {
      // Reset lastIndex for global regex
      const regex = new RegExp(def.pattern.source, def.pattern.flags);
      let m: RegExpExecArray | null;

      while ((m = regex.exec(text)) !== null) {
        const value = m[1] ?? m[0]; // Use capture group if present, else full match
        const key = `${m.index}:${m[0].length}`;

        if (!seen.has(key) && !this.isAllowlisted(value)) {
          seen.add(key);
          matches.push({
            name: def.name,
            value: m[0],
            start: m.index,
            end: m.index + m[0].length,
          });
        }
      }
    }

    // Sort by position (for stable replacement order)
    matches.sort((a, b) => a.start - b.start);
    return matches;
  }

  redact(text: string, prefix = 'PII'): PIIRedactionResult {
    const matches = this.detect(text);
    if (matches.length === 0) {
      return { redacted: text, placeholderMap: new Map() };
    }

    const placeholderMap = new Map<string, string>();
    // Reuse placeholders for identical values
    const valueToPlaceholder = new Map<string, string>();
    let counter = 0;

    let result = '';
    let lastEnd = 0;

    for (const match of matches) {
      // Skip overlapping matches
      if (match.start < lastEnd) {
        continue;
      }

      let placeholder = valueToPlaceholder.get(match.value);
      if (!placeholder) {
        counter++;
        placeholder = `[${prefix}_${String(counter).padStart(3, '0')}]`;
        valueToPlaceholder.set(match.value, placeholder);
        placeholderMap.set(placeholder, match.value);
      }

      result += text.slice(lastEnd, match.start) + placeholder;
      lastEnd = match.end;
    }

    result += text.slice(lastEnd);
    return { redacted: result, placeholderMap };
  }

  restore(text: string, placeholderMap: Map<string, string>): string {
    let result = text;
    for (const [placeholder, original] of placeholderMap) {
      // Replace all occurrences of this placeholder
      const escaped = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(escaped, 'g'), original);
    }
    return result;
  }
}
