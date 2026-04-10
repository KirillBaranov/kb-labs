/**
 * @module @kb-labs/mind-engine/query/query-expander
 * Query expansion with synonyms and technical terms
 *
 * Improves recall by expanding queries with:
 * - Technical synonyms (auth -> authentication, login, sign-in)
 * - Programming terms (func -> function, def, method)
 * - Common abbreviations (db -> database, repo -> repository)
 */

export interface QueryExpansionResult {
  /** Original query */
  original: string;

  /** Expanded query with synonyms */
  expanded: string;

  /** Individual expansion terms */
  terms: string[];

  /** Term mappings (original -> synonyms) */
  mappings: Map<string, string[]>;
}

export interface QueryExpanderOptions {
  /** Maximum synonyms per term */
  maxSynonymsPerTerm?: number;

  /** Enable tech abbreviation expansion */
  expandAbbreviations?: boolean;

  /** Enable programming term expansion */
  expandProgrammingTerms?: boolean;

  /** Custom term mappings */
  customMappings?: Record<string, string[]>;
}

/**
 * Query expander for improving search recall
 */
export class QueryExpander {
  private readonly options: Required<Omit<QueryExpanderOptions, 'customMappings'>>;
  private readonly customMappings: Map<string, string[]>;

  constructor(options: QueryExpanderOptions = {}) {
    this.options = {
      maxSynonymsPerTerm: options.maxSynonymsPerTerm ?? 3,
      expandAbbreviations: options.expandAbbreviations ?? true,
      expandProgrammingTerms: options.expandProgrammingTerms ?? true,
    };

    // Convert custom mappings to Map
    this.customMappings = new Map();
    if (options.customMappings) {
      for (const [term, synonyms] of Object.entries(options.customMappings)) {
        this.customMappings.set(term.toLowerCase(), synonyms);
      }
    }
  }

  /**
   * Expand query with synonyms and technical terms
   */
  expand(query: string): QueryExpansionResult {
    const terms = this.tokenize(query);
    const mappings = new Map<string, string[]>();
    const expandedTerms: string[] = [];

    for (const term of terms) {
      const synonyms = this.findSynonyms(term);

      if (synonyms.length > 0) {
        mappings.set(term, synonyms);
        // Add original + top N synonyms
        expandedTerms.push(term);
        expandedTerms.push(...synonyms.slice(0, this.options.maxSynonymsPerTerm));
      } else {
        // No synonyms, keep original
        expandedTerms.push(term);
      }
    }

    // Build expanded query (original terms + synonyms)
    const expanded = [...new Set(expandedTerms)].join(' ');

    return {
      original: query,
      expanded,
      terms: expandedTerms,
      mappings,
    };
  }

  /**
   * Find synonyms for a term
   */
  private findSynonyms(term: string): string[] {
    const lower = term.toLowerCase();
    const synonyms: string[] = [];

    // Check custom mappings first
    const custom = this.customMappings.get(lower);
    if (custom) {
      synonyms.push(...custom);
    }

    // Check abbreviations
    if (this.options.expandAbbreviations) {
      const abbrevSynonyms = ABBREVIATION_MAP.get(lower);
      if (abbrevSynonyms) {
        synonyms.push(...abbrevSynonyms);
      }
    }

    // Check programming terms
    if (this.options.expandProgrammingTerms) {
      const progSynonyms = PROGRAMMING_TERM_MAP.get(lower);
      if (progSynonyms) {
        synonyms.push(...progSynonyms);
      }
    }

    // Check technical synonyms
    const techSynonyms = TECHNICAL_SYNONYM_MAP.get(lower);
    if (techSynonyms) {
      synonyms.push(...techSynonyms);
    }

    return [...new Set(synonyms)]; // Remove duplicates
  }

  /**
   * Tokenize query into terms
   */
  private tokenize(query: string): string[] {
    return query
      .toLowerCase()
      .split(/\s+/)
      .filter(t => t.length > 0)
      .filter(t => !this.isStopWord(t));
  }

  /**
   * Check if word is stop word
   */
  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
      'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
      'would', 'should', 'could', 'may', 'might', 'must', 'can',
    ]);

    return stopWords.has(word);
  }
}

/**
 * Common tech abbreviations and their expansions
 */
const ABBREVIATION_MAP = new Map<string, string[]>([
  // Database
  ['db', ['database', 'databases']],
  ['sql', ['query', 'database']],

  // Repository/Version Control
  ['repo', ['repository', 'repositories']],
  ['pr', ['pull request', 'pullrequest']],
  ['mr', ['merge request', 'mergerequest']],

  // Authentication
  ['auth', ['authentication', 'authorize', 'login']],
  ['oauth', ['authentication', 'authorization']],
  ['jwt', ['token', 'authentication']],

  // Configuration
  ['config', ['configuration', 'settings']],
  ['env', ['environment', 'configuration']],

  // Application
  ['app', ['application', 'service']],
  ['api', ['endpoint', 'service', 'interface']],
  ['ui', ['interface', 'frontend', 'view']],

  // Data
  ['dto', ['data transfer object', 'model']],
  ['json', ['data', 'payload']],
  ['xml', ['data', 'markup']],

  // Network
  ['http', ['request', 'response', 'network']],
  ['https', ['secure', 'request', 'network']],
  ['url', ['link', 'address', 'endpoint']],

  // Common tech terms
  ['async', ['asynchronous', 'promise', 'await']],
  ['sync', ['synchronous', 'synchronize']],
  ['util', ['utility', 'helper', 'utils']],
  ['impl', ['implementation', 'implement']],
  ['mgr', ['manager', 'management']],
  ['svc', ['service', 'server']],
  ['ctrl', ['controller', 'control']],
  ['msg', ['message', 'messaging']],
  ['req', ['request']],
  ['res', ['response', 'result']],
  ['err', ['error', 'exception']],
  ['val', ['value', 'validate', 'validation']],
  ['param', ['parameter', 'params']],
  ['arg', ['argument', 'args']],
  ['temp', ['temporary', 'template']],
  ['doc', ['document', 'documentation']],
  ['spec', ['specification', 'specs']],
  ['test', ['testing', 'unittest']],
]);

/**
 * Programming language terms and their synonyms
 */
const PROGRAMMING_TERM_MAP = new Map<string, string[]>([
  // Functions
  ['func', ['function', 'method', 'procedure']],
  ['method', ['function', 'procedure']],
  ['procedure', ['function', 'method']],
  ['def', ['define', 'function', 'method']],
  ['lambda', ['anonymous function', 'closure']],

  // Classes/Types
  ['class', ['type', 'object', 'interface']],
  ['interface', ['contract', 'type', 'protocol']],
  ['struct', ['structure', 'type', 'object']],
  ['enum', ['enumeration', 'type']],
  ['type', ['typedef', 'interface']],

  // Variables
  ['var', ['variable', 'const', 'let']],
  ['const', ['constant', 'variable']],
  ['let', ['variable', 'var']],

  // Control flow
  ['if', ['conditional', 'condition']],
  ['else', ['otherwise', 'conditional']],
  ['switch', ['case', 'conditional']],
  ['loop', ['iterate', 'for', 'while']],
  ['iterate', ['loop', 'for each']],

  // OOP
  ['inherit', ['extend', 'subclass', 'derive']],
  ['extend', ['inherit', 'subclass']],
  ['implement', ['realize', 'override']],
  ['override', ['overwrite', 'redefine']],
  ['constructor', ['init', 'initialize', 'ctor']],
  ['destructor', ['cleanup', 'dispose', 'dtor']],

  // Async/Promises
  ['promise', ['async', 'future', 'deferred']],
  ['await', ['async', 'wait']],
  ['callback', ['handler', 'listener']],

  // Error handling
  ['error', ['exception', 'err', 'failure']],
  ['exception', ['error', 'throw']],
  ['throw', ['raise', 'exception']],
  ['catch', ['handle', 'rescue']],

  // Memory/Resources
  ['new', ['create', 'instantiate', 'allocate']],
  ['delete', ['remove', 'destroy', 'free']],
  ['free', ['release', 'deallocate']],

  // Import/Export
  ['import', ['require', 'include', 'use']],
  ['export', ['expose', 'public']],
  ['require', ['import', 'include']],
  ['include', ['import', 'require']],
]);

/**
 * Technical domain synonyms
 */
const TECHNICAL_SYNONYM_MAP = new Map<string, string[]>([
  // Authentication/Authorization
  ['login', ['signin', 'authenticate', 'auth']],
  ['signin', ['login', 'authenticate']],
  ['signup', ['register', 'registration']],
  ['register', ['signup', 'registration']],
  ['logout', ['signout', 'disconnect']],
  ['signout', ['logout', 'disconnect']],
  ['password', ['credential', 'secret', 'passphrase']],
  ['token', ['jwt', 'session', 'credential']],
  ['session', ['token', 'state']],

  // CRUD operations
  ['create', ['add', 'insert', 'new']],
  ['read', ['get', 'fetch', 'retrieve', 'find']],
  ['update', ['modify', 'edit', 'change', 'patch']],
  ['delete', ['remove', 'destroy', 'drop']],
  ['find', ['search', 'query', 'get', 'fetch']],
  ['search', ['find', 'query', 'filter']],
  ['filter', ['search', 'query', 'where']],

  // Data operations
  ['save', ['persist', 'store', 'write']],
  ['load', ['fetch', 'retrieve', 'read']],
  ['fetch', ['get', 'retrieve', 'load']],
  ['retrieve', ['fetch', 'get', 'load']],
  ['store', ['save', 'persist', 'cache']],
  ['cache', ['store', 'buffer', 'memoize']],

  // Validation/Verification
  ['validate', ['verify', 'check', 'test']],
  ['verify', ['validate', 'check', 'confirm']],
  ['check', ['validate', 'verify', 'test']],
  ['test', ['check', 'verify', 'validate']],

  // Processing
  ['process', ['handle', 'execute', 'run']],
  ['handle', ['process', 'manage', 'deal']],
  ['execute', ['run', 'perform', 'invoke']],
  ['run', ['execute', 'perform', 'start']],
  ['parse', ['decode', 'analyze', 'interpret']],
  ['decode', ['parse', 'deserialize']],
  ['encode', ['serialize', 'stringify']],
  ['serialize', ['encode', 'stringify']],
  ['deserialize', ['decode', 'parse']],

  // Server/Client
  ['server', ['backend', 'service', 'api']],
  ['client', ['frontend', 'consumer', 'caller']],
  ['backend', ['server', 'api', 'service']],
  ['frontend', ['client', 'ui', 'view']],

  // Request/Response
  ['request', ['req', 'call', 'query']],
  ['response', ['res', 'result', 'reply']],
  ['result', ['response', 'output', 'return']],
  ['output', ['result', 'response', 'return']],

  // Connection/Network
  ['connect', ['link', 'attach', 'join']],
  ['disconnect', ['close', 'detach', 'unlink']],
  ['send', ['emit', 'publish', 'transmit']],
  ['receive', ['get', 'subscribe', 'accept']],

  // State/Status
  ['status', ['state', 'condition']],
  ['state', ['status', 'condition']],
  ['enabled', ['active', 'on']],
  ['disabled', ['inactive', 'off']],
  ['active', ['enabled', 'running']],
  ['inactive', ['disabled', 'stopped']],

  // Configuration
  ['settings', ['config', 'configuration', 'options']],
  ['options', ['settings', 'config', 'parameters']],
  ['parameters', ['options', 'settings', 'args']],

  // User management
  ['user', ['account', 'profile', 'member']],
  ['account', ['user', 'profile']],
  ['profile', ['user', 'account']],
  ['admin', ['administrator', 'superuser']],
  ['administrator', ['admin', 'superuser']],

  // Common patterns
  ['builder', ['factory', 'creator', 'constructor']],
  ['factory', ['builder', 'creator', 'generator']],
  ['provider', ['supplier', 'source', 'factory']],
  ['service', ['manager', 'handler', 'provider']],
  ['manager', ['service', 'handler', 'controller']],
  ['controller', ['handler', 'manager', 'router']],
  ['handler', ['processor', 'controller', 'listener']],
  ['listener', ['handler', 'observer', 'subscriber']],
  ['observer', ['listener', 'watcher', 'subscriber']],
  ['helper', ['utility', 'util', 'tools']],
  ['utility', ['helper', 'util', 'tools']],
  ['tools', ['utility', 'helper', 'utils']],
]);
