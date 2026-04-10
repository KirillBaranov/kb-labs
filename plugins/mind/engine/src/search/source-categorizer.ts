/**
 * @module @kb-labs/mind-engine/search/source-categorizer
 * Source categorization for query-aware retrieval boosting
 */

import type { VectorSearchMatch } from '../vector-store/vector-store';

export type SourceCategory = 'adr' | 'code' | 'docs' | 'config' | 'test' | 'other';

export interface SourceCategoryConfig {
  type: SourceCategory;
  pathPatterns: RegExp[];
  extensionPatterns: RegExp[];
  /** Base weight multiplier for this category */
  baseWeight: number;
}

export interface CategorizedMatch extends VectorSearchMatch {
  category: SourceCategory;
  categoryWeight: number;
}

/**
 * Source category definitions
 */
const SOURCE_CATEGORIES: SourceCategoryConfig[] = [
  {
    type: 'adr',
    pathPatterns: [/\/adr\//i, /\/decisions?\//i, /ADR-?\d+/i],
    extensionPatterns: [/\.md$/i],
    baseWeight: 1.0,
  },
  {
    type: 'test',
    pathPatterns: [
      /\/__tests__\//,
      /\/test\//,
      /\/tests\//,
      /\.test\./,
      /\.spec\./,
      /_test\./,
      /_spec\./,
    ],
    extensionPatterns: [/\.(test|spec)\.(ts|tsx|js|jsx)$/i],
    baseWeight: 0.8,
  },
  {
    type: 'config',
    pathPatterns: [/\/config\//i, /\.config\./i, /rc\./i],
    extensionPatterns: [
      /\.(json|yaml|yml|toml|ini|env)$/i,
      /tsconfig.*\.json$/i,
      /package\.json$/i,
      /\.eslintrc/i,
      /\.prettierrc/i,
    ],
    baseWeight: 0.9,
  },
  {
    type: 'docs',
    pathPatterns: [/\/docs?\//i, /\/documentation\//i, /README/i, /CHANGELOG/i],
    extensionPatterns: [/\.md$/i, /\.mdx$/i, /\.rst$/i],
    baseWeight: 0.95,
  },
  {
    type: 'code',
    pathPatterns: [/\/src\//i, /\/lib\//i, /\/packages?\//i],
    extensionPatterns: [
      /\.(ts|tsx|js|jsx)$/i,
      /\.(py|rb|go|rs|java|kt|swift|c|cpp|h)$/i,
    ],
    baseWeight: 1.0,
  },
];

/**
 * Categorize a file path
 */
export function categorizeFile(path: string): SourceCategory {
  const normalizedPath = path.toLowerCase();

  for (const config of SOURCE_CATEGORIES) {
    // Check path patterns
    for (const pattern of config.pathPatterns) {
      if (pattern.test(normalizedPath)) {
        return config.type;
      }
    }

    // Check extension patterns
    for (const pattern of config.extensionPatterns) {
      if (pattern.test(normalizedPath)) {
        return config.type;
      }
    }
  }

  return 'other';
}

/**
 * Categorize search matches and add category info
 */
export function categorizeMatches(matches: VectorSearchMatch[]): CategorizedMatch[] {
  return matches.map(match => {
    const category = categorizeFile(match.chunk.path);
    const config = SOURCE_CATEGORIES.find(c => c.type === category);
    const categoryWeight = config?.baseWeight ?? 1.0;

    return {
      ...match,
      category,
      categoryWeight,
    };
  });
}

/**
 * Query-aware source boosting patterns
 */
interface QueryBoostPattern {
  /** Query patterns that trigger this boost */
  queryPatterns: RegExp[];
  /** Categories to boost */
  boostCategories: SourceCategory[];
  /** Boost multiplier (e.g., 1.3 = 30% boost) */
  boostMultiplier: number;
  /** Categories to demote (e.g., 0.7 = 30% reduction) */
  demoteCategories?: SourceCategory[];
  /** Demote multiplier */
  demoteMultiplier?: number;
}

const QUERY_BOOSTS: QueryBoostPattern[] = [
  // ADR/architecture queries boost ADR sources
  {
    queryPatterns: [
      /ADR/i,
      /decision/i,
      /architecture/i,
      /design\s+(decision|pattern)/i,
      /why\s+(did|do)\s+we/i,
      /strategy/i,
      /approach/i,
    ],
    boostCategories: ['adr', 'docs'],
    boostMultiplier: 1.4,
    demoteCategories: ['test', 'config'],
    demoteMultiplier: 0.6,
  },
  // Implementation queries boost code
  {
    queryPatterns: [
      /implement/i,
      /function/i,
      /class/i,
      /method/i,
      /interface/i,
      /how.*work/i,
      /code/i,
    ],
    boostCategories: ['code'],
    boostMultiplier: 1.3,
    demoteCategories: ['docs'],
    demoteMultiplier: 0.8,
  },
  // Config queries boost config files
  {
    queryPatterns: [
      /config/i,
      /setting/i,
      /option/i,
      /parameter/i,
      /environment/i,
      /\.env/i,
    ],
    boostCategories: ['config', 'docs'],
    boostMultiplier: 1.3,
  },
  // Test queries boost test files
  {
    queryPatterns: [
      /test/i,
      /spec/i,
      /mock/i,
      /fixture/i,
      /coverage/i,
    ],
    boostCategories: ['test'],
    boostMultiplier: 1.4,
    demoteCategories: ['docs', 'adr'],
    demoteMultiplier: 0.7,
  },
  // Documentation queries
  {
    queryPatterns: [
      /document/i,
      /readme/i,
      /guide/i,
      /tutorial/i,
      /example/i,
      /usage/i,
    ],
    boostCategories: ['docs', 'adr'],
    boostMultiplier: 1.3,
  },
];

/**
 * Apply query-aware boosting to categorized matches
 */
export function applyQueryBoost(
  matches: CategorizedMatch[],
  query: string,
): CategorizedMatch[] {
  // Find applicable boost pattern
  const applicableBoost = QUERY_BOOSTS.find(boost =>
    boost.queryPatterns.some(pattern => pattern.test(query))
  );

  if (!applicableBoost) {
    // No specific boost, return as-is
    return matches;
  }

  return matches.map(match => {
    let adjustedScore = match.score;

    // Apply boost
    if (applicableBoost.boostCategories.includes(match.category)) {
      adjustedScore *= applicableBoost.boostMultiplier;
    }

    // Apply demote
    if (
      applicableBoost.demoteCategories?.includes(match.category) &&
      applicableBoost.demoteMultiplier
    ) {
      adjustedScore *= applicableBoost.demoteMultiplier;
    }

    return {
      ...match,
      score: adjustedScore,
    };
  });
}

/**
 * Group matches by category
 */
export function groupByCategory(
  matches: CategorizedMatch[],
): Record<SourceCategory, CategorizedMatch[]> {
  const groups: Record<SourceCategory, CategorizedMatch[]> = {
    adr: [],
    code: [],
    docs: [],
    config: [],
    test: [],
    other: [],
  };

  for (const match of matches) {
    groups[match.category].push(match);
  }

  return groups;
}

/**
 * Get category statistics for matches
 */
export function getCategoryStats(
  matches: CategorizedMatch[],
): { category: SourceCategory; count: number; avgScore: number }[] {
  const groups = groupByCategory(matches);

  return Object.entries(groups)
    .filter(([_, items]) => items.length > 0)
    .map(([category, items]) => ({
      category: category as SourceCategory,
      count: items.length,
      avgScore: items.reduce((sum, m) => sum + m.score, 0) / items.length,
    }))
    .sort((a, b) => b.count - a.count);
}
