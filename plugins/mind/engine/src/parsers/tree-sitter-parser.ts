/**
 * @module @kb-labs/mind-engine/parsers/tree-sitter-parser
 * Tree-sitter based multi-language parser
 *
 * Optional dependency - falls back to generic parser if not available
 */

import type {
  LanguageParser,
  CodeStructure,
  StatementBoundary,
} from './language-parser';

/**
 * Tree-sitter parser with lazy loading
 * Falls back gracefully if tree-sitter is not installed
 */
export class TreeSitterParser implements LanguageParser {
  readonly language: string;
  private parser: any = null;
  private isLoaded = false;
  private loadError: Error | null = null;

  constructor(language: string) {
    this.language = language.toLowerCase();
  }

  /**
   * Lazy load Tree-sitter
   */
  private async loadParser(): Promise<boolean> {
    if (this.isLoaded) {
      return this.parser !== null;
    }

    try {
      // Try to dynamically import tree-sitter
      const Parser = await import('tree-sitter').then(m => m.default || m);
      this.parser = new Parser();

      // Load language grammar
      const grammar = await this.loadGrammar(this.language);
      if (grammar) {
        this.parser.setLanguage(grammar);
        this.isLoaded = true;
        return true;
      }

      this.loadError = new Error(`Grammar not found for language: ${this.language}`);
      this.isLoaded = true;
      return false;
    } catch (error) {
      this.loadError = error instanceof Error ? error : new Error(String(error));
      this.isLoaded = true;
      return false;
    }
  }

  /**
   * Load language grammar
   */
  private async loadGrammar(lang: string): Promise<any> {
    try {
      switch (lang) {
        case 'typescript':
        case 'tsx':
          const ts = await import('tree-sitter-typescript');
          return lang === 'tsx' ? ts.tsx : ts.typescript;

        case 'javascript':
        case 'jsx':
          const js = await import('tree-sitter-javascript');
          return js.default || js;

        case 'python':
          const py = await import('tree-sitter-python');
          return py.default || py;

        case 'go':
          const go = await import('tree-sitter-go');
          return go.default || go;

        case 'rust':
          const rust = await import('tree-sitter-rust');
          return rust.default || rust;

        case 'java':
          const java = await import('tree-sitter-java');
          return java.default || java;

        case 'c':
        case 'cpp':
        case 'c++':
          const c = await import('tree-sitter-c');
          return c.default || c;

        case 'csharp':
        case 'cs':
          const cs = await import('tree-sitter-c-sharp');
          return cs.default || cs;

        default:
          return null;
      }
    } catch {
      return null;
    }
  }

  findStatementBoundaries(code: string): StatementBoundary[] {
    // Synchronous wrapper - use cached parser if available
    if (!this.isLoaded) {
      // Not loaded yet, trigger async load for next time
      this.loadParser().catch(() => {});
      return [];
    }

    if (!this.parser) {
      return [];
    }

    try {
      const tree = this.parser.parse(code);
      const boundaries: StatementBoundary[] = [];

      this.traverseAST(tree.rootNode, (node: any) => {
        const type = this.mapNodeType(node.type);
        if (type) {
          boundaries.push({
            start: node.startPosition.row,
            end: node.endPosition.row,
            type,
            name: this.extractNodeName(node, code),
          });
        }
      });

      return boundaries;
    } catch {
      return [];
    }
  }

  extractStructure(code: string): CodeStructure {
    if (!this.isLoaded) {
      this.loadParser().catch(() => {});
      return { functions: [], classes: [], imports: [], exports: [] };
    }

    if (!this.parser) {
      return { functions: [], classes: [], imports: [], exports: [] };
    }

    try {
      const tree = this.parser.parse(code);
      const structure: CodeStructure = {
        functions: [],
        classes: [],
        imports: [],
        exports: [],
      };

      this.traverseAST(tree.rootNode, (node: any) => {
        // Extract functions
        if (this.isFunctionNode(node.type)) {
          const name = this.extractNodeName(node, code);
          if (name) {
            structure.functions.push({
              name,
              startLine: node.startPosition.row,
              endLine: node.endPosition.row,
              signature: code.substring(node.startIndex, node.endIndex).split('\n')[0],
            });
          }
        }

        // Extract classes
        if (this.isClassNode(node.type)) {
          const name = this.extractNodeName(node, code);
          if (name) {
            structure.classes.push({
              name,
              startLine: node.startPosition.row,
              endLine: node.endPosition.row,
            });
          }
        }

        // Extract imports
        if (this.isImportNode(node.type)) {
          const source = this.extractImportSource(node, code);
          if (source) {
            structure.imports.push({
              source,
              line: node.startPosition.row,
            });
          }
        }

        // Extract exports
        if (this.isExportNode(node.type)) {
          const name = this.extractNodeName(node, code);
          if (name) {
            structure.exports.push({
              name,
              type: this.inferExportType(node.type),
              line: node.startPosition.row,
            });
          }
        }
      });

      return structure;
    } catch {
      return { functions: [], classes: [], imports: [], exports: [] };
    }
  }

  getKeywords(): { declarations: string[]; control: string[]; modifiers: string[] } {
    const keywords = LANGUAGE_KEYWORDS[this.language] ?? LANGUAGE_KEYWORDS.generic;
    // Fallback to generic if somehow both are undefined (shouldn't happen)
    return keywords ?? {
      declarations: ['function', 'class', 'interface', 'type', 'const', 'let', 'var'],
      control: ['if', 'else', 'for', 'while', 'switch', 'case', 'return', 'break', 'continue'],
      modifiers: ['public', 'private', 'protected', 'static', 'async', 'export', 'import'],
    };
  }

  isAvailable(): boolean {
    if (!this.isLoaded) {
      // Trigger async load
      this.loadParser().catch(() => {});
      return false;
    }
    return this.parser !== null;
  }

  /**
   * Traverse AST tree
   */
  private traverseAST(node: any, callback: (node: any) => void): void {
    callback(node);
    for (let i = 0; i < node.childCount; i++) {
      this.traverseAST(node.child(i), callback);
    }
  }

  /**
   * Map Tree-sitter node type to our boundary type
   */
  private mapNodeType(nodeType: string): StatementBoundary['type'] | null {
    if (this.isFunctionNode(nodeType)) {return 'function';}
    if (this.isClassNode(nodeType)) {return 'class';}
    if (nodeType.includes('method')) {return 'method';}
    if (nodeType.includes('block')) {return 'block';}
    return null;
  }

  /**
   * Check if node is function-like
   */
  private isFunctionNode(nodeType: string): boolean {
    const functionTypes = [
      'function_declaration',
      'function_definition',
      'arrow_function',
      'function_expression',
      'method_definition',
      'function_item', // Rust
      'func_literal', // Go
    ];
    return functionTypes.includes(nodeType);
  }

  /**
   * Check if node is class-like
   */
  private isClassNode(nodeType: string): boolean {
    const classTypes = [
      'class_declaration',
      'class_definition',
      'interface_declaration',
      'struct_item', // Rust
      'type_declaration', // Go
    ];
    return classTypes.includes(nodeType);
  }

  /**
   * Check if node is import
   */
  private isImportNode(nodeType: string): boolean {
    return nodeType.includes('import') || nodeType.includes('using');
  }

  /**
   * Check if node is export
   */
  private isExportNode(nodeType: string): boolean {
    return nodeType.includes('export');
  }

  /**
   * Extract name from node
   */
  private extractNodeName(node: any, code: string): string | undefined {
    const nameNode = node.childForFieldName('name');
    if (nameNode) {
      return code.substring(nameNode.startIndex, nameNode.endIndex);
    }
    return undefined;
  }

  /**
   * Extract import source
   */
  private extractImportSource(node: any, code: string): string | undefined {
    const sourceNode = node.childForFieldName('source');
    if (sourceNode) {
      const source = code.substring(sourceNode.startIndex, sourceNode.endIndex);
      return source.replace(/['"]/g, '');
    }
    return undefined;
  }

  /**
   * Infer export type from node type
   */
  private inferExportType(nodeType: string): CodeStructure['exports'][number]['type'] {
    if (nodeType.includes('function')) {return 'function';}
    if (nodeType.includes('class')) {return 'class';}
    if (nodeType.includes('type') || nodeType.includes('interface')) {return 'type';}
    if (nodeType.includes('default')) {return 'default';}
    return 'const';
  }
}

/**
 * Language-specific keywords
 */
const LANGUAGE_KEYWORDS: Record<string, {
  declarations: string[];
  control: string[];
  modifiers: string[];
}> = {
  typescript: {
    declarations: ['function', 'class', 'interface', 'type', 'const', 'let', 'var', 'enum'],
    control: ['if', 'else', 'for', 'while', 'switch', 'case', 'return', 'break', 'continue', 'throw', 'try', 'catch'],
    modifiers: ['public', 'private', 'protected', 'static', 'async', 'export', 'import', 'readonly', 'abstract'],
  },
  python: {
    declarations: ['def', 'class', 'lambda'],
    control: ['if', 'elif', 'else', 'for', 'while', 'return', 'break', 'continue', 'raise', 'try', 'except', 'with', 'yield'],
    modifiers: ['async', 'await', 'import', 'from', 'global', 'nonlocal'],
  },
  go: {
    declarations: ['func', 'type', 'struct', 'interface', 'var', 'const'],
    control: ['if', 'else', 'for', 'switch', 'case', 'return', 'break', 'continue', 'goto', 'defer', 'select'],
    modifiers: ['import', 'package', 'go', 'chan'],
  },
  csharp: {
    declarations: ['class', 'interface', 'struct', 'enum', 'delegate', 'void', 'var'],
    control: ['if', 'else', 'for', 'foreach', 'while', 'do', 'switch', 'case', 'return', 'break', 'continue', 'throw', 'try', 'catch'],
    modifiers: ['public', 'private', 'protected', 'internal', 'static', 'async', 'virtual', 'override', 'abstract', 'sealed', 'using', 'namespace'],
  },
  rust: {
    declarations: ['fn', 'struct', 'enum', 'trait', 'impl', 'type', 'let', 'const', 'static'],
    control: ['if', 'else', 'match', 'for', 'while', 'loop', 'return', 'break', 'continue'],
    modifiers: ['pub', 'async', 'await', 'use', 'mod', 'crate', 'mut', 'ref'],
  },
  java: {
    declarations: ['class', 'interface', 'enum', 'void', 'var'],
    control: ['if', 'else', 'for', 'while', 'do', 'switch', 'case', 'return', 'break', 'continue', 'throw', 'try', 'catch'],
    modifiers: ['public', 'private', 'protected', 'static', 'final', 'abstract', 'synchronized', 'volatile', 'import', 'package'],
  },
  generic: {
    declarations: ['function', 'class', 'interface', 'type', 'const', 'let', 'var', 'def', 'func', 'fn'],
    control: ['if', 'else', 'for', 'while', 'switch', 'case', 'return', 'break', 'continue'],
    modifiers: ['public', 'private', 'protected', 'static', 'async', 'export', 'import'],
  },
};
