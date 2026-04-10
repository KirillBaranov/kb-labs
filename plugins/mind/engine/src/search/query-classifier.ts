/**
 * @module @kb-labs/mind-engine/search/query-classifier
 * Query classification for adaptive search weights
 */
import type { ILLM, LLMMessage, LLMToolCallOptions } from '@kb-labs/sdk';

export type QueryType = 'lookup' | 'concept' | 'code' | 'debug' | 'general';
export type RetrievalProfile = 'exact_lookup' | 'semantic_explore';
export type RecallStrategy = 'default' | 'broad_recall';

export interface QueryClassification {
  type: QueryType;
  retrievalProfile: RetrievalProfile;
  recallStrategy: RecallStrategy;
  confidence: number;
  weights: {
    vector: number;
    keyword: number;
  };
  suggestedLimit: number;
}

interface QueryPattern {
  patterns: RegExp[];
  weights: { vector: number; keyword: number };
  suggestedLimit: number;
}

export interface QueryClassifierLLMOptions {
  llm?: ILLM | null;
  enabled?: boolean;
  minRuleConfidence?: number;
  maxRuleConfidence?: number;
}

/**
 * Query patterns and their optimal search weights
 */
const QUERY_PATTERNS: Record<QueryType, QueryPattern> = {
  // Lookup: specific names, identifiers, exact matches
  lookup: {
    patterns: [
      /^[A-Z][a-zA-Z0-9]+$/,                    // PascalCase (class names)
      /^[a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*$/,   // camelCase (function names)
      /^\w+_\w+$/,                               // snake_case
      /^[A-Z][A-Z_0-9]+$/,                       // CONSTANT_CASE
      /^(get|set|create|delete|update|find)\w+$/i, // Method patterns
      /`\w+`/,                                   // Backtick identifiers
      /"\w+"|\'\w+\'/,                           // Quoted identifiers
      /\b[a-z0-9]+(?:-[a-z0-9]+)+\b/,            // kebab-case (commands, file ids)
      /--[a-z0-9-]+/,                             // CLI flags
      /^where\s+is\s+/i,                         // "where is X"
      /^find\s+(the\s+)?\w+/i,                   // "find X"
      /\b(cli|command|subcommand|flag|option)\b/i,
    ],
    weights: { vector: 0.3, keyword: 0.7 },
    suggestedLimit: 120,
  },

  // Concept: understanding, explanations, "how does X work"
  concept: {
    patterns: [
      /^how\s+(does|do|to|can|should)/i,
      /^what\s+(is|are|does)/i,
      /^why\s+(does|do|is|are)/i,
      /^explain\s+/i,
      /^describe\s+/i,
      /^when\s+should/i,
      /architecture|design|pattern|approach/i,
      /relationship\s+between/i,
      /difference\s+between/i,
    ],
    weights: { vector: 0.8, keyword: 0.2 },
    suggestedLimit: 15,
  },

  // Code: implementation details, writing code
  code: {
    patterns: [
      /implement/i,
      /function.*that/i,
      /create.*class/i,
      /write.*code/i,
      /example.*of/i,
      /syntax\s+for/i,
      /how.*implement/i,
      /code.*for/i,
      /snippet/i,
    ],
    weights: { vector: 0.6, keyword: 0.4 },
    suggestedLimit: 12,
  },

  // Debug: errors, bugs, fixes
  debug: {
    patterns: [
      /error/i,
      /bug/i,
      /fix/i,
      /crash/i,
      /fail/i,
      /not\s+work/i,
      /doesn.*t\s+work/i,
      /broken/i,
      /issue/i,
      /problem/i,
      /why\s+(does|is).*not/i,
      /invalid/i,
      /undefined|null|NaN/i,
      /exception|throw/i,
    ],
    weights: { vector: 0.4, keyword: 0.6 },
    suggestedLimit: 80,
  },

  // General: default fallback
  general: {
    patterns: [],
    weights: { vector: 0.6, keyword: 0.4 },
    suggestedLimit: 12,
  },
};

/**
 * Priority order for classification (first match wins)
 */
const CLASSIFICATION_PRIORITY: QueryType[] = [
  'lookup',
  'debug',
  'code',
  'concept',
  'general',
];

/**
 * Classify a query to determine optimal search strategy
 */
export function classifyQuery(query: string): QueryClassification {
  const normalizedQuery = query.trim();

  // Special case: "What is X" where X is a specific identifier (PascalCase)
  // These should be treated as lookup queries, not concept queries
  const whatIsMatch = normalizedQuery.match(/^what\s+is\s+(?:the\s+)?([A-Z][a-zA-Z0-9]+)/i);
  if (whatIsMatch) {
    const identifier = whatIsMatch[1] ?? '';
    // If it's a PascalCase identifier, treat as lookup
    if (/^[A-Z][a-z]+[A-Z]?\w*$/.test(identifier)) {
      return {
        type: 'lookup',
        retrievalProfile: 'exact_lookup',
        recallStrategy: 'default',
        confidence: 0.85,
        weights: { vector: 0.3, keyword: 0.7 },
        suggestedLimit: 120,
      };
    }
  }

  // Check for explicit identifiers in query (highest priority for lookup)
  if (hasExactIdentifier(normalizedQuery)) {
    const identifiers = extractIdentifiers(normalizedQuery);
    if (identifiers.length > 0) {
      return {
        type: 'lookup',
        retrievalProfile: 'exact_lookup',
        recallStrategy: 'default',
        confidence: 0.9,
        weights: { vector: 0.3, keyword: 0.7 },
        suggestedLimit: 120,
      };
    }
  }

  // Check each type in priority order
  for (const type of CLASSIFICATION_PRIORITY) {
    if (type === 'general') {continue;} // Skip general, it's fallback

    const pattern = QUERY_PATTERNS[type];
    const matchCount = pattern.patterns.filter(p => p.test(normalizedQuery)).length;

    if (matchCount > 0) {
      // Calculate confidence based on how many patterns matched
      const confidence = Math.min(0.95, 0.6 + matchCount * 0.15);

      return {
        type,
        retrievalProfile: type === 'lookup' || type === 'debug' ? 'exact_lookup' : 'semantic_explore',
        recallStrategy: 'default',
        confidence,
        weights: pattern.weights,
        suggestedLimit: pattern.suggestedLimit,
      };
    }
  }

  // Default to general
  return {
    type: 'general',
    retrievalProfile: 'semantic_explore',
    recallStrategy: 'default',
    confidence: 0.5,
    weights: QUERY_PATTERNS.general.weights,
    suggestedLimit: QUERY_PATTERNS.general.suggestedLimit,
  };
}

const CLASSIFIER_TOOL_NAME = 'set_query_profile';
const classifierCache = new Map<string, { expiresAt: number; value: QueryClassification }>();

export async function classifyQueryWithLLMFallback(
  query: string,
  options: QueryClassifierLLMOptions = {},
): Promise<QueryClassification> {
  const baseline = classifyQuery(query);
  if (!shouldUseLLMClassifier(query, baseline, options)) {
    return baseline;
  }

  const cacheKey = buildClassifierCacheKey(query);
  const now = Date.now();
  const cached = classifierCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const llm = options.llm;
  if (!llm?.chatWithTools) {
    return baseline;
  }

  try {
    const messages: LLMMessage[] = [
        {
          role: 'system',
          content:
            'Classify retrieval intent for agent search. Use the provided tool exactly once with the best profile.',
        },
        {
          role: 'user',
          content: `Query: ${query}`,
        },
      ];
    const toolOptions: LLMToolCallOptions = {
        temperature: 0,
        maxTokens: 200,
        tools: [
          {
            name: CLASSIFIER_TOOL_NAME,
            description:
              'Set retrieval profile and calibration strategy for query routing.',
            inputSchema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                profile: { type: 'string', enum: ['exact_lookup', 'semantic_explore'] },
                confidence: { type: 'number', minimum: 0, maximum: 1 },
                recallStrategy: { type: 'string', enum: ['default', 'broad_recall'] },
                reason: { type: 'string' },
              },
              required: ['profile', 'confidence', 'recallStrategy'],
            },
          },
        ],
        toolChoice: { type: 'function', function: { name: CLASSIFIER_TOOL_NAME } },
      };
    const response = await llm.chatWithTools(messages, toolOptions);

    const toolCall = response.toolCalls?.find((call) => call?.name === CLASSIFIER_TOOL_NAME);
    const parsed = parseToolClassification(toolCall?.input);
    if (!parsed) {
      return baseline;
    }

    const merged = mergeClassificationDecision(baseline, parsed);
    classifierCache.set(cacheKey, {
      value: merged,
      expiresAt: now + 5 * 60_000,
    });
    return merged;
  } catch {
    return baseline;
  }
}

function shouldUseLLMClassifier(
  query: string,
  baseline: QueryClassification,
  options: QueryClassifierLLMOptions,
): boolean {
  if (options.enabled === false) {
    return false;
  }
  const minRuleConfidence = options.minRuleConfidence ?? 0.55;
  const maxRuleConfidence = options.maxRuleConfidence ?? 0.88;
  const inUncertaintyBand =
    baseline.confidence >= minRuleConfidence && baseline.confidence <= maxRuleConfidence;

  const technicalSignals =
    /`[^`]+`/.test(query) ||
    /--[a-z0-9-]+/.test(query) ||
    /\b[a-z0-9]+(?:-[a-z0-9]+)+\b/.test(query) ||
    /\b[A-Z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*\b/.test(query);
  const likelyNoExactAnswer = /\b(explain|why|how)\b/i.test(query) && !technicalSignals;

  return inUncertaintyBand || likelyNoExactAnswer;
}

function parseToolClassification(
  input: unknown,
): { profile: RetrievalProfile; confidence: number; recallStrategy: RecallStrategy } | null {
  if (!input || typeof input !== 'object') {
    return null;
  }
  const data = input as Record<string, unknown>;
  const profile = data.profile;
  const confidence = Number(data.confidence);
  const recallStrategy = data.recallStrategy;
  if (
    (profile !== 'exact_lookup' && profile !== 'semantic_explore') ||
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1 ||
    (recallStrategy !== 'default' && recallStrategy !== 'broad_recall')
  ) {
    return null;
  }
  return {
    profile,
    confidence,
    recallStrategy,
  };
}

function mergeClassificationDecision(
  baseline: QueryClassification,
  llmDecision: { profile: RetrievalProfile; confidence: number; recallStrategy: RecallStrategy },
): QueryClassification {
  // Prevent low-confidence LLM override from destabilizing exact lookups.
  if (llmDecision.confidence < 0.6) {
    return baseline;
  }

  if (llmDecision.profile === baseline.retrievalProfile) {
    return {
      ...baseline,
      confidence: Math.max(baseline.confidence, llmDecision.confidence),
      recallStrategy: llmDecision.recallStrategy,
    };
  }

  if (llmDecision.profile === 'exact_lookup') {
    return {
      ...baseline,
      type: baseline.type === 'general' ? 'lookup' : baseline.type,
      retrievalProfile: 'exact_lookup',
      recallStrategy: llmDecision.recallStrategy,
      confidence: llmDecision.confidence,
      weights: { vector: 0.3, keyword: 0.7 },
      suggestedLimit: Math.max(baseline.suggestedLimit, 80),
    };
  }

  return {
    ...baseline,
    retrievalProfile: 'semantic_explore',
    recallStrategy: llmDecision.recallStrategy,
    confidence: llmDecision.confidence,
    weights: { vector: 0.75, keyword: 0.25 },
    suggestedLimit: Math.max(baseline.suggestedLimit, 20),
  };
}

function buildClassifierCacheKey(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Check if query contains specific technical identifiers
 */
export function hasExactIdentifier(query: string): boolean {
  // Check for quoted strings, backticks, or PascalCase/camelCase
  return (
    /`[^`]+`/.test(query) ||
    /"[^"]+"/.test(query) ||
    /'[^']+'/.test(query) ||
    /\b[a-z0-9]+(?:-[a-z0-9]+)+\b/.test(query) ||
    /--[a-z0-9-]+/.test(query) ||
    /\b[A-Z][a-z]+[A-Z]\w*\b/.test(query) ||
    /\b[a-z]+[A-Z]\w+\b/.test(query)
  );
}

/**
 * Extract identifiers from query for keyword boost
 */
export function extractIdentifiers(query: string): string[] {
  const identifiers: string[] = [];
  const commonSentenceWords = new Set([
    'What',
    'Where',
    'When',
    'How',
    'Why',
    'Which',
    'Who',
    'Is',
    'Are',
    'Can',
    'Do',
    'Does',
    'Tell',
    'Show',
    'Find',
    'Explain',
  ]);

  // Backtick identifiers
  const backticks = query.match(/`([^`]+)`/g);
  if (backticks) {
    identifiers.push(...backticks.map(s => s.slice(1, -1)));
  }

  // Quoted strings
  const quoted = query.match(/["']([^"']+)["']/g);
  if (quoted) {
    identifiers.push(...quoted.map(s => s.slice(1, -1)));
  }

  // PascalCase
  const pascalCase = query.match(/\b[A-Z][a-zA-Z0-9]+\b/g);
  if (pascalCase) {
    identifiers.push(
      ...pascalCase.filter((token) => !commonSentenceWords.has(token)),
    );
  }

  // camelCase (starting with lowercase)
  const camelCase = query.match(/\b[a-z]+[A-Z][a-zA-Z0-9]*\b/g);
  if (camelCase) {
    identifiers.push(...camelCase);
  }

  // kebab-case (commands like rag-index, paths/tokens)
  const kebabCase = query.match(/\b[a-z0-9]+(?:-[a-z0-9]+)+\b/g);
  if (kebabCase) {
    identifiers.push(...kebabCase);
  }

  // CLI flags (--mode, --text)
  const cliFlags = query.match(/--[a-z0-9-]+/g);
  if (cliFlags) {
    identifiers.push(...cliFlags);
  }

  return [...new Set(identifiers)];
}

/**
 * Detect if query is in Russian (for future multi-language support)
 */
export function detectLanguage(query: string): 'en' | 'ru' | 'other' {
  if (/[а-яА-ЯёЁ]/.test(query)) {
    return 'ru';
  }
  if (/^[a-zA-Z0-9\s\W]+$/.test(query)) {
    return 'en';
  }
  return 'other';
}
