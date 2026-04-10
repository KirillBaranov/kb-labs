/**
 * @module @kb-labs/mind-engine/parsers/language-parser
 * Language-agnostic parser interface for code analysis
 */

export interface CodeStructure {
  /** Functions found in code */
  functions: Array<{
    name: string;
    startLine: number;
    endLine: number;
    signature?: string;
  }>;

  /** Classes found in code */
  classes: Array<{
    name: string;
    startLine: number;
    endLine: number;
  }>;

  /** Import statements */
  imports: Array<{
    source: string;
    imported?: string[];
    line: number;
  }>;

  /** Export statements */
  exports: Array<{
    name: string;
    type: 'function' | 'class' | 'const' | 'type' | 'default';
    line: number;
  }>;
}

export interface StatementBoundary {
  start: number;
  end: number;
  type: 'function' | 'class' | 'method' | 'block' | 'statement';
  name?: string;
}

/**
 * Base interface for language parsers
 */
export interface LanguageParser {
  /** Language identifier */
  readonly language: string;

  /**
   * Find statement boundaries in code
   */
  findStatementBoundaries(code: string): StatementBoundary[];

  /**
   * Extract code structure (functions, classes, imports, exports)
   */
  extractStructure(code: string): CodeStructure;

  /**
   * Get keywords for this language
   */
  getKeywords(): {
    declarations: string[];
    control: string[];
    modifiers: string[];
  };

  /**
   * Check if parser is available for use
   * (e.g., Tree-sitter grammar is loaded)
   */
  isAvailable(): boolean;
}

/**
 * Parser factory
 */
export class ParserFactory {
  private static parsers = new Map<string, LanguageParser>();

  /**
   * Register a parser for a language
   */
  static register(language: string, parser: LanguageParser): void {
    this.parsers.set(language.toLowerCase(), parser);
  }

  /**
   * Get parser for language
   */
  static getParser(language: string): LanguageParser {
    const lang = language.toLowerCase();
    const parser = this.parsers.get(lang);

    if (parser && parser.isAvailable()) {
      return parser;
    }

    // Fallback to generic parser
    return this.parsers.get('generic') ?? new GenericParser();
  }

  /**
   * Check if parser is available for language
   */
  static hasParser(language: string): boolean {
    const parser = this.parsers.get(language.toLowerCase());
    return parser !== undefined && parser.isAvailable();
  }
}

/**
 * Generic fallback parser using regex patterns
 */
export class GenericParser implements LanguageParser {
  readonly language = 'generic';

  findStatementBoundaries(code: string): StatementBoundary[] {
    const lines = code.split('\n');
    const boundaries: StatementBoundary[] = [];
    let currentBoundary: StatementBoundary | null = null;
    let braceDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      const trimmed = line.trim();

      // Track brace depth
      for (const char of line) {
        if (char === '{') {braceDepth++;}
        if (char === '}') {braceDepth--;}
      }

      // Detect function/class start
      if (this.isDeclarationStart(trimmed) && !currentBoundary) {
        const name = this.extractName(trimmed);
        const type = this.inferType(trimmed);
        currentBoundary = {
          start: i,
          end: i,
          type,
          name,
        };
      }

      // Close boundary when braces balance
      if (currentBoundary && braceDepth === 0 && trimmed.endsWith('}')) {
        currentBoundary.end = i;
        boundaries.push(currentBoundary);
        currentBoundary = null;
      }
    }

    // Close any unclosed boundary
    if (currentBoundary) {
      currentBoundary.end = lines.length - 1;
      boundaries.push(currentBoundary);
    }

    return boundaries;
  }

  extractStructure(code: string): CodeStructure {
    const lines = code.split('\n');
    const structure: CodeStructure = {
      functions: [],
      classes: [],
      imports: [],
      exports: [],
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      const trimmed = line.trim();

      // Extract functions
      const funcMatch = trimmed.match(/(?:async\s+)?(?:function|def|func|fn)\s+(\w+)/);
      if (funcMatch) {
        structure.functions.push({
          name: funcMatch[1] ?? 'anonymous',
          startLine: i,
          endLine: this.findBlockEnd(lines, i),
          signature: trimmed,
        });
      }

      // Extract classes
      const classMatch = trimmed.match(/(?:class|struct|interface)\s+(\w+)/);
      if (classMatch) {
        structure.classes.push({
          name: classMatch[1] ?? 'Anonymous',
          startLine: i,
          endLine: this.findBlockEnd(lines, i),
        });
      }

      // Extract imports
      if (trimmed.startsWith('import ') || trimmed.startsWith('from ') || trimmed.startsWith('using ')) {
        const importMatch = trimmed.match(/(?:from|import|using)\s+['"]?([^'";\s]+)/);
        if (importMatch) {
          structure.imports.push({
            source: importMatch[1] ?? '',
            line: i,
          });
        }
      }

      // Extract exports
      if (trimmed.startsWith('export ')) {
        const exportMatch = trimmed.match(/export\s+(?:default\s+)?(?:(?:const|let|var|function|class)\s+)?(\w+)/);
        if (exportMatch) {
          structure.exports.push({
            name: exportMatch[1] ?? '',
            type: this.inferExportType(trimmed),
            line: i,
          });
        }
      }
    }

    return structure;
  }

  getKeywords() {
    return {
      declarations: ['function', 'class', 'interface', 'type', 'const', 'let', 'var', 'def', 'func', 'fn'],
      control: ['if', 'else', 'for', 'while', 'switch', 'case', 'return', 'break', 'continue'],
      modifiers: ['public', 'private', 'protected', 'static', 'async', 'export', 'import'],
    };
  }

  isAvailable(): boolean {
    return true;
  }

  private isDeclarationStart(line: string): boolean {
    const patterns = [
      /^(?:export\s+)?(?:async\s+)?function\s+/,
      /^(?:export\s+)?(?:default\s+)?class\s+/,
      /^(?:export\s+)?interface\s+/,
      /^(?:public|private|protected)\s+(?:async\s+)?(?:function|class)/,
      /^def\s+/,
      /^func\s+/,
    ];

    return patterns.some(p => p.test(line));
  }

  private extractName(line: string): string | undefined {
    const match = line.match(/(?:function|class|interface|type|def|func|fn)\s+(\w+)/);
    return match?.[1];
  }

  private inferType(line: string): StatementBoundary['type'] {
    if (line.includes('function') || line.includes('def') || line.includes('func')) {
      return 'function';
    }
    if (line.includes('class')) {
      return 'class';
    }
    return 'statement';
  }

  private inferExportType(line: string): CodeStructure['exports'][number]['type'] {
    if (line.includes('function')) {return 'function';}
    if (line.includes('class')) {return 'class';}
    if (line.includes('const') || line.includes('let') || line.includes('var')) {return 'const';}
    if (line.includes('type') || line.includes('interface')) {return 'type';}
    if (line.includes('default')) {return 'default';}
    return 'const';
  }

  private findBlockEnd(lines: string[], start: number): number {
    let depth = 0;
    for (let i = start; i < lines.length; i++) {
      const line = lines[i] ?? '';
      for (const char of line) {
        if (char === '{') {depth++;}
        if (char === '}') {depth--;}
        if (depth === 0 && char === '}') {
          return i;
        }
      }
    }
    return lines.length - 1;
  }
}

// Register generic parser as default
ParserFactory.register('generic', new GenericParser());
