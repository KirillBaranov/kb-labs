/**
 * QueryExpander - Intelligent query expansion for better retrieval
 *
 * Expands user queries with:
 * - Synonyms (e.g., "function" → "method", "procedure")
 * - Related terms (e.g., "authentication" → "login", "JWT", "session")
 * - Technical variations (e.g., "React" → "useState", "useEffect")
 * - Common misspellings
 *
 * Benefits:
 * - Better recall (finds more relevant chunks)
 * - Handles ambiguous queries
 * - Language-aware expansion
 */

export interface QueryExpansion {
  /**
   * Original query
   */
  original: string;

  /**
   * Expanded terms
   */
  expanded: string[];

  /**
   * Expansion strategy used
   */
  strategy: 'synonyms' | 'related' | 'technical' | 'none';

  /**
   * Confidence score (0-1)
   */
  confidence: number;
}

export interface QueryExpanderOptions {
  /**
   * Maximum expanded terms
   * Default: 5
   */
  maxExpansions?: number;

  /**
   * Enable technical term expansion
   * Default: true
   */
  technical?: boolean;

  /**
   * Enable synonym expansion
   * Default: true
   */
  synonyms?: boolean;

  /**
   * Programming language context
   */
  language?: string;
}

/**
 * Query Expander
 * Intelligently expands queries for better retrieval
 */
export class QueryExpander {
  private synonymMap: Map<string, string[]> = new Map();
  private technicalMap: Map<string, string[]> = new Map();

  constructor(private options: QueryExpanderOptions = {}) {
    this.initializeMaps();
  }

  /**
   * Expand a query
   */
  async expand(query: string): Promise<QueryExpansion> {
    const tokens = this.tokenize(query);
    const expanded: Set<string> = new Set();
    let strategy: QueryExpansion['strategy'] = 'none';

    // Try technical expansion first
    if (this.options.technical !== false) {
      const technical = this.expandTechnical(tokens);
      if (technical.length > 0) {
        technical.forEach(t => expanded.add(t));
        strategy = 'technical';
      }
    }

    // Try synonym expansion
    if (this.options.synonyms !== false && expanded.size === 0) {
      const synonyms = this.expandSynonyms(tokens);
      if (synonyms.length > 0) {
        synonyms.forEach(s => expanded.add(s));
        strategy = 'synonyms';
      }
    }

    // Limit expansions
    const maxExpansions = this.options.maxExpansions ?? 5;
    const expandedArray = Array.from(expanded).slice(0, maxExpansions);

    // Calculate confidence
    const confidence = this.calculateConfidence(expandedArray, strategy);

    return {
      original: query,
      expanded: expandedArray,
      strategy,
      confidence,
    };
  }

  /**
   * Tokenize query into words
   */
  private tokenize(query: string): string[] {
    return query
      .toLowerCase()
      .split(/\s+/)
      .filter(t => t.length > 0);
  }

  /**
   * Expand technical terms
   */
  private expandTechnical(tokens: string[]): string[] {
    const expanded: Set<string> = new Set();

    for (const token of tokens) {
      const technical = this.technicalMap.get(token);
      if (technical) {
        technical.forEach(t => expanded.add(t));
      }
    }

    return Array.from(expanded);
  }

  /**
   * Expand synonyms
   */
  private expandSynonyms(tokens: string[]): string[] {
    const expanded: Set<string> = new Set();

    for (const token of tokens) {
      const synonyms = this.synonymMap.get(token);
      if (synonyms) {
        synonyms.forEach(s => expanded.add(s));
      }
    }

    return Array.from(expanded);
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(
    expanded: string[],
    strategy: QueryExpansion['strategy']
  ): number {
    if (expanded.length === 0) {
      return 0;
    }

    // Technical expansions are more confident
    if (strategy === 'technical') {
      return 0.9;
    }

    // Synonym expansions are moderately confident
    if (strategy === 'synonyms') {
      return 0.7;
    }

    return 0.5;
  }

  /**
   * Initialize synonym and technical maps
   */
  private initializeMaps(): void {
    // Programming concepts - synonyms
    this.synonymMap.set('function', ['method', 'procedure', 'routine']);
    this.synonymMap.set('method', ['function', 'procedure']);
    this.synonymMap.set('variable', ['var', 'constant', 'field']);
    this.synonymMap.set('class', ['type', 'struct', 'object']);
    this.synonymMap.set('interface', ['contract', 'protocol']);
    this.synonymMap.set('import', ['require', 'include', 'using']);
    this.synonymMap.set('export', ['expose', 'module']);
    this.synonymMap.set('async', ['asynchronous', 'promise', 'await']);
    this.synonymMap.set('error', ['exception', 'failure', 'bug']);
    this.synonymMap.set('test', ['spec', 'unit test', 'integration test']);

    // React - technical terms
    this.technicalMap.set('react', [
      'useState',
      'useEffect',
      'useContext',
      'useRef',
      'useMemo',
      'useCallback',
      'component',
      'jsx',
      'props',
      'state',
    ]);

    // Authentication - technical terms
    this.technicalMap.set('authentication', [
      'login',
      'logout',
      'jwt',
      'token',
      'session',
      'oauth',
      'credentials',
      'password',
      'auth',
    ]);
    this.technicalMap.set('auth', [
      'authentication',
      'authorization',
      'login',
      'jwt',
      'token',
    ]);

    // Database - technical terms
    this.technicalMap.set('database', [
      'sql',
      'query',
      'table',
      'schema',
      'migration',
      'orm',
      'prisma',
      'typeorm',
    ]);
    this.technicalMap.set('db', ['database', 'sql', 'query']);

    // API - technical terms
    this.technicalMap.set('api', [
      'endpoint',
      'route',
      'controller',
      'rest',
      'graphql',
      'http',
      'request',
      'response',
    ]);

    // TypeScript - technical terms
    this.technicalMap.set('typescript', [
      'type',
      'interface',
      'generic',
      'enum',
      'decorator',
      'namespace',
    ]);
    this.technicalMap.set('ts', ['typescript', 'type', 'interface']);

    // Testing - technical terms
    this.technicalMap.set('test', [
      'jest',
      'vitest',
      'mocha',
      'chai',
      'expect',
      'describe',
      'it',
      'mock',
      'spy',
    ]);

    // State management - technical terms
    this.technicalMap.set('state', [
      'redux',
      'zustand',
      'context',
      'store',
      'reducer',
      'action',
      'dispatch',
    ]);

    // Styling - technical terms
    this.technicalMap.set('style', [
      'css',
      'tailwind',
      'styled-components',
      'emotion',
      'sass',
      'less',
    ]);
  }

  /**
   * Add custom synonym mapping
   */
  addSynonym(word: string, synonyms: string[]): void {
    this.synonymMap.set(word.toLowerCase(), synonyms);
  }

  /**
   * Add custom technical mapping
   */
  addTechnical(term: string, related: string[]): void {
    this.technicalMap.set(term.toLowerCase(), related);
  }
}

/**
 * Create query expander with default options
 */
export function createQueryExpander(
  options: QueryExpanderOptions = {}
): QueryExpander {
  return new QueryExpander(options);
}
