/**
 * @module @kb-labs/mind-engine/filtering/negative-filter
 * Negative filtering to remove low-quality results
 *
 * Filters out tests, mocks, generated code, and deprecated content
 * improving precision by removing noise from search results.
 */

import type { VectorSearchMatch } from '../vector-store/vector-store';

export interface NegativeFilterOptions {
  /**
   * Enable test file filtering
   * Default: true
   */
  excludeTests?: boolean;

  /**
   * Enable generated code filtering
   * Default: true
   */
  excludeGenerated?: boolean;

  /**
   * Enable deprecated code filtering
   * Default: true
   */
  excludeDeprecated?: boolean;

  /**
   * Enable low-quality code filtering
   * Default: false (experimental)
   */
  excludeLowQuality?: boolean;

  /**
   * Custom path patterns to exclude
   * Default: []
   */
  customExcludePatterns?: string[];

  /**
   * Minimum code quality score (0-1)
   * Default: 0.5
   */
  minCodeQuality?: number;
}

export interface FilterResult {
  /** Filtered matches */
  matches: VectorSearchMatch[];

  /** Number of matches filtered out */
  filteredCount: number;

  /** Breakdown by filter reason */
  filterBreakdown: {
    tests: number;
    generated: number;
    deprecated: number;
    lowQuality: number;
    customPatterns: number;
  };
}

/**
 * Negative filter for removing low-quality search results
 */
export class NegativeFilter {
  private readonly options: Required<Omit<NegativeFilterOptions, 'customExcludePatterns'>> & {
    customExcludePatterns: string[];
  };

  constructor(options: NegativeFilterOptions = {}) {
    this.options = {
      excludeTests: options.excludeTests ?? true,
      excludeGenerated: options.excludeGenerated ?? true,
      excludeDeprecated: options.excludeDeprecated ?? true,
      excludeLowQuality: options.excludeLowQuality ?? false,
      customExcludePatterns: options.customExcludePatterns ?? [],
      minCodeQuality: options.minCodeQuality ?? 0.5,
    };
  }

  /**
   * Filter search results
   */
  filter(matches: VectorSearchMatch[]): FilterResult {
    const filterBreakdown = {
      tests: 0,
      generated: 0,
      deprecated: 0,
      lowQuality: 0,
      customPatterns: 0,
    };

    const filtered = matches.filter(match => {
      // Test file filtering
      if (this.options.excludeTests && this.isTestFile(match)) {
        filterBreakdown.tests++;
        return false;
      }

      // Generated code filtering
      if (this.options.excludeGenerated && this.isGeneratedCode(match)) {
        filterBreakdown.generated++;
        return false;
      }

      // Deprecated code filtering
      if (this.options.excludeDeprecated && this.isDeprecated(match)) {
        filterBreakdown.deprecated++;
        return false;
      }

      // Low quality code filtering
      if (this.options.excludeLowQuality) {
        const quality = this.calculateCodeQuality(match);
        if (quality < this.options.minCodeQuality) {
          filterBreakdown.lowQuality++;
          return false;
        }
      }

      // Custom pattern filtering
      if (this.matchesCustomExcludePattern(match)) {
        filterBreakdown.customPatterns++;
        return false;
      }

      return true;
    });

    return {
      matches: filtered,
      filteredCount: matches.length - filtered.length,
      filterBreakdown,
    };
  }

  /**
   * Check if file is a test file
   */
  private isTestFile(match: VectorSearchMatch): boolean {
    const path = match.chunk.path.toLowerCase();
    const text = match.chunk.text.toLowerCase();

    // Path patterns
    const testPathPatterns = [
      /\.test\.(ts|js|tsx|jsx|py|go|rs|java|cs)$/,
      /\.spec\.(ts|js|tsx|jsx|py|go|rs|java|cs)$/,
      /_test\.(ts|js|tsx|jsx|py|go|rs|java|cs)$/,
      /\/tests?\//,
      /\/__tests__\//,
      /\/spec\//,
      /\/test_/,
    ];

    if (testPathPatterns.some(p => p.test(path))) {
      return true;
    }

    // Content patterns (test assertions)
    const testContentPatterns = [
      /\b(describe|it|test|expect|assert|should)\s*\(/,
      /\b(beforeEach|afterEach|beforeAll|afterAll)\s*\(/,
      /\bMock\b/,
      /\bStub\b/,
      /jest\.fn\(/,
      /sinon\./,
      /\bfixture\b/i,
    ];

    // Count test patterns
    const testPatternMatches = testContentPatterns.filter(p => p.test(text)).length;

    // If 3+ test patterns, likely a test
    return testPatternMatches >= 3;
  }

  /**
   * Check if code is generated
   */
  private isGeneratedCode(match: VectorSearchMatch): boolean {
    const text = match.chunk.text;
    const path = match.chunk.path;

    // Generated file patterns
    const generatedPathPatterns = [
      /\.generated\./,
      /\.g\.(ts|js|go|rs|cs)$/,
      /-gen\.(ts|js|go|rs|cs)$/,
      /\/generated\//,
      /\/dist\//,
      /\/build\//,
      /\/out\//,
      /node_modules\//,
      /\.min\.(js|css)$/,
    ];

    if (generatedPathPatterns.some(p => p.test(path))) {
      return true;
    }

    // Generated code markers
    const generatedMarkers = [
      /@generated/i,
      /DO NOT EDIT/i,
      /AUTO-GENERATED/i,
      /Code generated by/i,
      /GENERATED CODE/i,
      /This file was automatically generated/i,
      /\*\s*AUTO GENERATED/i,
    ];

    return generatedMarkers.some(p => p.test(text));
  }

  /**
   * Check if code is deprecated
   */
  private isDeprecated(match: VectorSearchMatch): boolean {
    const text = match.chunk.text;

    const deprecatedPatterns = [
      /@deprecated/i,
      /@Deprecated/,
      /\[deprecated\]/i,
      /\bDEPRECATED\b/,
      // Common deprecation comments
      /\/\/.*deprecated/i,
      /\/\*.*deprecated.*\*\//i,
      // Python
      /warnings\.warn.*deprecat/i,
      // Rust
      /#\[deprecated/,
    ];

    return deprecatedPatterns.some(p => p.test(text));
  }

  /**
   * Calculate code quality score (0-1)
   */
  private calculateCodeQuality(match: VectorSearchMatch): number {
    const text = match.chunk.text;
    const lines = text.split('\n');
    const nonEmptyLines = lines.filter((l: string) => l.trim().length > 0);

    if (nonEmptyLines.length === 0) {return 0;}

    let qualityScore = 1.0;

    // Penalize high comment ratio (>50% comments)
    const commentLines = lines.filter((l: string) => {
      const trimmed = l.trim();
      return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('#');
    });
    const commentRatio = commentLines.length / nonEmptyLines.length;
    if (commentRatio > 0.5) {
      qualityScore -= 0.3;
    }

    // Penalize TODO/FIXME/HACK markers
    const todoMarkers = [/TODO/i, /FIXME/i, /HACK/i, /XXX/i];
    const todoCount = todoMarkers.filter(p => p.test(text)).length;
    if (todoCount > 2) {
      qualityScore -= 0.2;
    }

    // Penalize console.log/print statements (debugging code)
    const debugPatterns = [
      /console\.(log|debug|warn|error)/,
      /\bprint\s*\(/,
      /\bprintln!\(/,
      /\bfmt\.Println/,
      /\bSystem\.out\.println/,
    ];
    const debugCount = debugPatterns.filter(p => p.test(text)).length;
    if (debugCount > 2) {
      qualityScore -= 0.2;
    }

    // Penalize very short chunks (likely incomplete)
    if (text.length < 100) {
      qualityScore -= 0.3;
    }

    // Penalize chunks with no actual code (just comments/whitespace)
    const codeLines = nonEmptyLines.filter((l: string) => {
      const trimmed = l.trim();
      return !trimmed.startsWith('//') &&
             !trimmed.startsWith('*') &&
             !trimmed.startsWith('#') &&
             trimmed !== '{' &&
             trimmed !== '}';
    });
    const codeRatio = codeLines.length / nonEmptyLines.length;
    if (codeRatio < 0.3) {
      qualityScore -= 0.3;
    }

    return Math.max(0, qualityScore);
  }

  /**
   * Check if matches custom exclude pattern
   */
  private matchesCustomExcludePattern(match: VectorSearchMatch): boolean {
    const path = match.chunk.path;

    return this.options.customExcludePatterns.some(pattern => {
      // Convert glob pattern to regex
      const regex = new RegExp(
        pattern
          .replace(/\./g, '\\.')
          .replace(/\*/g, '.*')
          .replace(/\?/g, '.')
      );
      return regex.test(path);
    });
  }
}
