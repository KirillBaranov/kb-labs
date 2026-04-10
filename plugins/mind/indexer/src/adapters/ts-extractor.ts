/**
 * TypeScript export extractor using TS Compiler API
 */

import * as ts from "typescript";
import type { IExportExtractor } from "../types/index";
import type { ApiExport } from "@kb-labs/mind-types";

/**
 * TypeScript export extractor implementation
 */
export class TSExtractor implements IExportExtractor {
  private program?: ts.Program;
  private sourceFiles = new Map<string, ts.SourceFile>();

  async extractExports(filePath: string, content: string): Promise<ApiExport[]> {
    try {
      // Create source file
      const sourceFile = ts.createSourceFile(
        filePath,
        content,
        ts.ScriptTarget.Latest,
        true,
        this.getScriptKind(filePath)
      );

      const exports: ApiExport[] = [];
      
      // Visit AST nodes
      const visit = (node: ts.Node) => {
        if (ts.isExportDeclaration(node)) {
          this.extractExportDeclaration(node, exports);
        } else if (ts.isExportAssignment(node)) {
          this.extractExportAssignment(node, exports);
        } else if (ts.isFunctionDeclaration(node) && node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
          this.extractFunctionDeclaration(node, exports);
        } else if (ts.isClassDeclaration(node) && node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
          this.extractClassDeclaration(node, exports);
        } else if (ts.isInterfaceDeclaration(node) && node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
          this.extractInterfaceDeclaration(node, exports);
        } else if (ts.isTypeAliasDeclaration(node) && node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
          this.extractTypeAliasDeclaration(node, exports);
        } else if (ts.isEnumDeclaration(node) && node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
          this.extractEnumDeclaration(node, exports);
        } else if (ts.isVariableStatement(node) && node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
          this.extractVariableStatement(node, exports);
        }

        ts.forEachChild(node, visit);
      };

      visit(sourceFile);
      return exports;
      } catch {
      // Fail-open: return empty array on parse errors
      return [];
    }
  }

  private getScriptKind(filePath: string): ts.ScriptKind {
    const ext = filePath.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'tsx': return ts.ScriptKind.TSX;
      case 'ts': return ts.ScriptKind.TS;
      case 'jsx': return ts.ScriptKind.JSX;
      case 'js': return ts.ScriptKind.JS;
      default: return ts.ScriptKind.Unknown;
    }
  }

  private extractExportDeclaration(node: ts.ExportDeclaration, exports: ApiExport[]): void {
    if (node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const element of node.exportClause.elements) {
        exports.push({
          name: element.name.text,
          kind: "const", // Default for named exports
          signature: this.getCompactSignature(element),
          jsdoc: this.getJSDocComment(element)
        });
      }
    }
  }

  private extractExportAssignment(node: ts.ExportAssignment, exports: ApiExport[]): void {
    if (node.expression && ts.isIdentifier(node.expression)) {
      exports.push({
        name: node.expression.text,
        kind: "const",
        signature: this.getCompactSignature(node),
        jsdoc: this.getJSDocComment(node)
      });
    }
  }

  private extractFunctionDeclaration(node: ts.FunctionDeclaration, exports: ApiExport[]): void {
    if (node.name) {
      exports.push({
        name: node.name.text,
        kind: "function",
        signature: this.getCompactSignature(node),
        jsdoc: this.getJSDocComment(node)
      });
    }
  }

  private extractClassDeclaration(node: ts.ClassDeclaration, exports: ApiExport[]): void {
    if (node.name) {
      exports.push({
        name: node.name.text,
        kind: "class",
        signature: this.getCompactSignature(node),
        jsdoc: this.getJSDocComment(node)
      });
    }
  }

  private extractInterfaceDeclaration(node: ts.InterfaceDeclaration, exports: ApiExport[]): void {
    exports.push({
      name: node.name.text,
      kind: "interface",
      signature: this.getCompactSignature(node),
      jsdoc: this.getJSDocComment(node)
    });
  }

  private extractTypeAliasDeclaration(node: ts.TypeAliasDeclaration, exports: ApiExport[]): void {
    exports.push({
      name: node.name.text,
      kind: "type",
      signature: this.getCompactSignature(node),
      jsdoc: this.getJSDocComment(node)
    });
  }

  private extractEnumDeclaration(node: ts.EnumDeclaration, exports: ApiExport[]): void {
    exports.push({
      name: node.name.text,
      kind: "enum",
      signature: this.getCompactSignature(node),
      jsdoc: this.getJSDocComment(node)
    });
  }

  private extractVariableStatement(node: ts.VariableStatement, exports: ApiExport[]): void {
    for (const declaration of node.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name)) {
        exports.push({
          name: declaration.name.text,
          kind: "const",
          signature: this.getCompactSignature(declaration),
          jsdoc: this.getJSDocComment(declaration)
        });
      }
    }
  }

  private getCompactSignature(node: ts.Node): string {
    try {
      const sourceFile = node.getSourceFile();
      const text = sourceFile.getFullText();
      const start = node.getStart();
      const end = node.getEnd();
      const signature = text.slice(start, end);
      
      // Truncate to first line and limit length
      const firstLine = signature.split('\n')[0];
      if (!firstLine) {return '';}
      return firstLine.length > 100 ? firstLine.slice(0, 97) + '...' : firstLine;
    } catch {
      return '';
    }
  }

  private getJSDocComment(node: ts.Node): string {
    try {
      const jsdoc = ts.getJSDocCommentsAndTags(node);
      if (jsdoc.length > 0) {
        const comment = jsdoc[0];
        if (comment && ts.isJSDoc(comment) && comment.comment) {
          // Get first line of JSDoc comment
          const commentText = typeof comment.comment === 'string' ? comment.comment : comment.comment.map(c => c.text).join(' ');
          const lines = commentText.split('\n');
          return lines[0]?.trim() || '';
        }
      }
      return '';
    } catch {
      return '';
    }
  }
}
