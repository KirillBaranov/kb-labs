export interface SymbolExtractor {
  extract(dtsContent: string): Set<string>;
}

/**
 * Regex-based symbol extractor for .d.ts files.
 * Handles common export patterns. Interface allows future replacement with TS Compiler API.
 */
export class RegexSymbolExtractor implements SymbolExtractor {
  extract(dtsContent: string): Set<string> {
    const symbols = new Set<string>();

    // export function foo / export async function foo
    for (const m of dtsContent.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm)) {
      symbols.add(m[1]!);
    }

    // export class Foo / export abstract class Foo
    for (const m of dtsContent.matchAll(/^export\s+(?:abstract\s+)?class\s+(\w+)/gm)) {
      symbols.add(m[1]!);
    }

    // export type Foo / export interface Foo
    for (const m of dtsContent.matchAll(/^export\s+(?:type\s+|interface\s+)(\w+)/gm)) {
      symbols.add(m[1]!);
    }

    // export const foo / export let foo / export var foo
    for (const m of dtsContent.matchAll(/^export\s+(?:const|let|var)\s+(\w+)/gm)) {
      symbols.add(m[1]!);
    }

    // export enum Foo
    for (const m of dtsContent.matchAll(/^export\s+(?:const\s+)?enum\s+(\w+)/gm)) {
      symbols.add(m[1]!);
    }

    // export { foo, bar as baz }
    for (const m of dtsContent.matchAll(/^export\s+\{([^}]+)\}/gm)) {
      const entries = m[1]!.split(',').map((s) => s.trim());
      for (const entry of entries) {
        // Handle "foo as bar" — the exported name is "bar"
        const asMatch = entry.match(/\w+\s+as\s+(\w+)/);
        if (asMatch) {
          symbols.add(asMatch[1]!);
        } else {
          const nameMatch = entry.match(/^(\w+)/);
          if (nameMatch) {symbols.add(nameMatch[1]!);}
        }
      }
    }

    // export default
    if (/^export\s+default\s+/m.test(dtsContent)) {
      symbols.add('default');
    }

    return symbols;
  }
}

export const defaultSymbolExtractor: SymbolExtractor = new RegexSymbolExtractor();
