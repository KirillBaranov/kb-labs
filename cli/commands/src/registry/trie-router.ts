/**
 * @kb-labs/cli-commands/registry/trie-router
 * Path-based trie router for CLI command resolution.
 *
 * Replaces the flat-map InMemoryRegistry + backtracking resolveCommand().
 * Two trie instances: systemTrie (always first) + pluginTrie (plugins).
 *
 * Key guarantees:
 *  - O(depth) resolution — no backtracking
 *  - No collisions: same last-segment in different paths are distinct nodes
 *  - "did you mean?" via Levenshtein ≤ 2 + findDeep shorthand detection
 *  - Tab completion via complete()
 */

import type { RegisteredCommand } from './types';
import type { Command as SystemCommand, CommandGroup as SystemGroup } from '@kb-labs/shared-command-kit';

export type { SystemCommand, SystemGroup };

// ─── Route result ─────────────────────────────────────────────────────────────

export type RouteResult =
  | { type: 'system-cmd';   cmd: SystemCommand;        rest: string[] }
  | { type: 'system-group'; group: SystemGroup;         rest: string[] }
  | { type: 'command';      command: RegisteredCommand; rest: string[] }
  | { type: 'group';        segments: string[];          describe?: string; childKeys: string[] }
  | { type: 'ambiguous';    input: string[];              candidates: string[] }
  | { type: 'not-found';    input: string[];              suggestions: string[] };

// ─── Diagnostics ──────────────────────────────────────────────────────────────

export interface RegistryDiagnostics {
  systemCommandCount: number;
  systemGroupCount: number;
  pluginCommandCount: number;
  partialLoad: boolean;
}

// ─── Trie internals ───────────────────────────────────────────────────────────

interface TrieNode {
  children: Map<string, TrieNode>;
  command?: RegisteredCommand;
  systemCommand?: SystemCommand;
  systemGroup?: SystemGroup;
  groupDescribe?: string;
}

function makeNode(): TrieNode {
  return { children: new Map() };
}

// ─── Levenshtein distance (edit distance) ─────────────────────────────────────

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (__, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]!;
      } else {
        dp[i]![j] = 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
      }
    }
  }
  return dp[m]![n]!;
}

// ─── DFS to find commands whose path ends with targetSegments ─────────────────

function findDeep(
  node: TrieNode,
  targetSegments: string[],
  prefix: string[]
): string[] {
  const results: string[] = [];

  function dfs(current: TrieNode, path: string[]): void {
    if (current.command) {
      // Check if path ends with targetSegments
      if (targetSegments.length <= path.length) {
        const tail = path.slice(path.length - targetSegments.length);
        const matches = tail.every((seg, i) => seg === targetSegments[i]);
        if (matches) {
          results.push(path.join(' '));
        }
      }
    }
    for (const [key, child] of current.children) {
      dfs(child, [...path, key]);
    }
  }

  dfs(node, [...prefix]);
  return results;
}

// ─── TrieRouter ───────────────────────────────────────────────────────────────

export class TrieRouter {
  private readonly root: TrieNode = makeNode();

  insertCommand(segments: readonly string[], cmd: RegisteredCommand): void {
    let node = this.root;
    for (const seg of segments) {
      if (!node.children.has(seg)) {
        node.children.set(seg, makeNode());
      }
      node = node.children.get(seg)!;
    }
    node.command = cmd;
  }

  insertSystemCommand(cmd: SystemCommand): void {
    const segments = [cmd.name];
    let node = this.root;
    for (const seg of segments) {
      if (!node.children.has(seg)) {
        node.children.set(seg, makeNode());
      }
      node = node.children.get(seg)!;
    }
    node.systemCommand = cmd;

    for (const alias of cmd.aliases ?? []) {
      let aliasNode = this.root;
      if (!aliasNode.children.has(alias)) {
        aliasNode.children.set(alias, makeNode());
      }
      aliasNode = aliasNode.children.get(alias)!;
      aliasNode.systemCommand = cmd;
    }
  }

  insertSystemGroup(group: SystemGroup): void {
    let groupNode = this.root;
    if (!groupNode.children.has(group.name)) {
      groupNode.children.set(group.name, makeNode());
    }
    groupNode = groupNode.children.get(group.name)!;
    groupNode.systemGroup = group;
    groupNode.groupDescribe = group.describe;

    for (const cmd of group.commands) {
      let cmdNode = groupNode;
      if (!cmdNode.children.has(cmd.name)) {
        cmdNode.children.set(cmd.name, makeNode());
      }
      cmdNode = cmdNode.children.get(cmd.name)!;
      cmdNode.systemCommand = cmd;

      for (const alias of cmd.aliases ?? []) {
        let aliasNode = groupNode;
        if (!aliasNode.children.has(alias)) {
          aliasNode.children.set(alias, makeNode());
        }
        aliasNode = aliasNode.children.get(alias)!;
        aliasNode.systemCommand = cmd;
      }
    }

    for (const sub of group.subgroups ?? []) {
      let subNode = groupNode;
      if (!subNode.children.has(sub.name)) {
        subNode.children.set(sub.name, makeNode());
      }
      subNode = subNode.children.get(sub.name)!;
      subNode.systemGroup = sub;
      subNode.groupDescribe = sub.describe;

      for (const cmd of sub.commands) {
        let cmdNode = subNode;
        if (!cmdNode.children.has(cmd.name)) {
          cmdNode.children.set(cmd.name, makeNode());
        }
        cmdNode = cmdNode.children.get(cmd.name)!;
        cmdNode.systemCommand = cmd;
      }
    }
  }

  setGroupDescribe(segments: string[], describe: string): void {
    let node = this.root;
    for (const seg of segments) {
      if (!node.children.has(seg)) {
        node.children.set(seg, makeNode());
      }
      node = node.children.get(seg)!;
    }
    if (!node.groupDescribe) {
      node.groupDescribe = describe;
    }
  }

  resolve(tokens: string[]): RouteResult {
    if (tokens.length === 0) {
      return {
        type: 'group',
        segments: [],
        childKeys: [...this.root.children.keys()],
      };
    }

    let node = this.root;
    let i = 0;

    while (i < tokens.length) {
      const tok = tokens[i]!;
      const child = node.children.get(tok);

      if (!child) {
        // Token not found — run "did you mean?" logic
        return this._notFound(node, tokens, i);
      }

      node = child;
      i++;

      // If we hit a command node and there are more tokens → positional args
      if (node.command && i < tokens.length) {
        return { type: 'command', command: node.command, rest: tokens.slice(i) };
      }
      if (node.systemCommand && i < tokens.length) {
        return { type: 'system-cmd', cmd: node.systemCommand, rest: tokens.slice(i) };
      }
    }

    // Consumed all tokens — check what's at current node
    if (node.command) {
      return { type: 'command', command: node.command, rest: [] };
    }
    if (node.systemCommand) {
      return { type: 'system-cmd', cmd: node.systemCommand, rest: [] };
    }
    if (node.systemGroup) {
      return { type: 'system-group', group: node.systemGroup, rest: [] };
    }
    if (node.children.size > 0 || node.groupDescribe !== undefined) {
      const segs = tokens.slice(0, i);
      return {
        type: 'group',
        segments: segs,
        describe: node.groupDescribe,
        childKeys: [...node.children.keys()],
      };
    }

    return { type: 'not-found', input: tokens, suggestions: [] };
  }

  complete(tokens: string[]): string[] {
    if (tokens.length === 0) {
      return [...this.root.children.keys()];
    }

    let node = this.root;

    // Walk through all tokens except the last (which may be partial)
    for (let i = 0; i < tokens.length - 1; i++) {
      const child = node.children.get(tokens[i]!);
      if (!child) return [];
      node = child;
    }

    const partial = tokens[tokens.length - 1] ?? '';
    const results: string[] = [];
    const prefix = tokens.slice(0, tokens.length - 1);

    for (const [key] of node.children) {
      if (key.startsWith(partial)) {
        results.push([...prefix, key].join(' '));
      }
    }

    return results;
  }

  /**
   * List all leaf plugin commands under a given node path.
   */
  listUnder(segments: string[]): RegisteredCommand[] {
    let node = this.root;
    for (const seg of segments) {
      const child = node.children.get(seg);
      if (!child) return [];
      node = child;
    }
    const results: RegisteredCommand[] = [];
    this._collectCommands(node, results);
    return results;
  }

  /**
   * Get exact command at path.
   */
  getAt(segments: string[]): RegisteredCommand | null {
    let node = this.root;
    for (const seg of segments) {
      const child = node.children.get(seg);
      if (!child) return null;
      node = child;
    }
    return node.command ?? null;
  }

  /**
   * Collect all plugin commands reachable from node.
   */
  listAll(): RegisteredCommand[] {
    const results: RegisteredCommand[] = [];
    this._collectCommands(this.root, results);
    return results;
  }

  private _collectCommands(node: TrieNode, out: RegisteredCommand[]): void {
    if (node.command) out.push(node.command);
    for (const child of node.children.values()) {
      this._collectCommands(child, out);
    }
  }

  private _notFound(node: TrieNode, tokens: string[], failIdx: number): RouteResult {
    const failToken = tokens[failIdx]!;
    const prefix = tokens.slice(0, failIdx);
    const siblings = [...node.children.keys()];

    // 1. Fuzzy match on siblings (Levenshtein ≤ 2)
    const fuzzy = siblings
      .map((s) => ({ s, d: levenshtein(failToken, s) }))
      .filter(({ d }) => d <= 2)
      .sort((a, b) => a.d - b.d)
      .map(({ s }) => [...prefix, s, ...tokens.slice(failIdx + 1)].join(' '));

    if (fuzzy.length === 1) {
      return { type: 'not-found', input: tokens, suggestions: fuzzy };
    }
    if (fuzzy.length > 1) {
      return { type: 'ambiguous', input: tokens, candidates: fuzzy };
    }

    // 2. findDeep — shorthand: e.g. "clickup create" → all paths ending in "create"
    const remaining = tokens.slice(failIdx);
    const deep = findDeep(node, remaining, prefix);

    if (deep.length === 0) {
      return { type: 'not-found', input: tokens, suggestions: [] };
    }
    if (deep.length === 1) {
      return { type: 'not-found', input: tokens, suggestions: deep };
    }
    return { type: 'ambiguous', input: tokens, candidates: deep };
  }
}
