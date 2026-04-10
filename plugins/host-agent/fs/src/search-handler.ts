/**
 * SearchHandler — handles capability calls for adapter: 'search'
 *
 * Supported methods:
 *   grep(pattern, directory, options?)  → GrepResult
 *   glob(pattern, directory, options?)  → GlobResult
 *
 * Security: all paths are validated against allowedPaths allowlist.
 *
 * @see ADR-0017: Workspace Agent Architecture (Phase 3)
 */

import { execSync } from 'node:child_process';
import { resolve, normalize, sep } from 'node:path';
import type { CapabilityCall } from '@kb-labs/host-agent-contracts';

interface GrepMatch {
  file: string;
  line: number;
  content: string;
}

interface GrepResult {
  matches: GrepMatch[];
  truncated: boolean;
  totalMatches: number;
}

interface GlobResult {
  files: string[];
  truncated: boolean;
  totalFiles: number;
}

interface GrepOptions {
  includes?: string[];
  excludes?: string[];
  maxResults?: number;
  contextLines?: number;
}

interface GlobOptions {
  excludes?: string[];
  maxResults?: number;
}

const DEFAULT_EXCLUDES = ['node_modules', '.git', 'dist', '.next', '.kb/cache', '.kb/runtime'];
const DEFAULT_MAX_RESULTS = 100;
const SEARCH_TIMEOUT_MS = 15_000;
const SEARCH_MAX_BUFFER = 5 * 1024 * 1024; // 5MB

export interface SearchHandlerOptions {
  allowedPaths: string[];
}

export class SearchHandler {
  constructor(private readonly opts: SearchHandlerOptions) {}

  async handle(call: CapabilityCall): Promise<unknown> {
    switch (call.method) {
      case 'grep':
        return this.grep(
          this.argString(call.args, 0),
          this.argString(call.args, 1),
          (call.args[2] as GrepOptions) ?? {},
        );
      case 'glob':
        return this.glob(
          this.argString(call.args, 0),
          this.argString(call.args, 1),
          (call.args[2] as GlobOptions) ?? {},
        );
      default:
        throw new Error(`Unknown search method: ${call.method}`);
    }
  }

  private argString(args: unknown[], index: number): string {
    const val = args[index];
    if (typeof val !== 'string' || val.length === 0) {
      throw new Error(`Expected non-empty string at args[${index}]`);
    }
    return val;
  }

  private validatePath(filePath: string): string {
    const resolved = resolve(normalize(filePath));
    const allowed = this.opts.allowedPaths.some((p) => {
      const base = resolve(normalize(p));
      return resolved === base || resolved.startsWith(base + sep);
    });
    if (!allowed) { throw new Error(`Access denied: ${filePath}`); }
    return resolved;
  }

  private grep(pattern: string, directory: string, options: GrepOptions): GrepResult {
    const dir = this.validatePath(directory);
    const maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS;
    const excludes = options.excludes ?? DEFAULT_EXCLUDES;

    const excludeFlags = excludes.map(d => `--exclude-dir=${d}`).join(' ');
    const includeFlags = options.includes
      ? options.includes.map(ext => `--include='${ext}'`).join(' ')
      : '';
    const contextFlag = options.contextLines ? `-C ${options.contextLines}` : '';

    // Try rg first, fallback to grep
    const cmd = this.hasRipgrep()
      ? `rg --no-heading --line-number --max-count=${maxResults} ${excludes.map(d => `--glob='!${d}'`).join(' ')} ${options.includes ? options.includes.map(ext => `--glob='${ext}'`).join(' ') : ''} ${contextFlag ? `-C ${options.contextLines}` : ''} -- ${this.shellEscape(pattern)} ${this.shellEscape(dir)}`
      : `grep -rn ${excludeFlags} ${includeFlags} ${contextFlag} -m ${maxResults} -- ${this.shellEscape(pattern)} ${this.shellEscape(dir)}`;

    try {
      const stdout = execSync(cmd, {
        timeout: SEARCH_TIMEOUT_MS,
        maxBuffer: SEARCH_MAX_BUFFER,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const lines = stdout.trim().split('\n').filter(Boolean);
      const matches: GrepMatch[] = [];

      for (const line of lines) {
        const match = line.match(/^(.+?):(\d+):(.*)$/);
        if (match) {
          matches.push({
            file: match[1]!,
            line: parseInt(match[2]!, 10),
            content: match[3]!,
          });
        }
      }

      return {
        matches: matches.slice(0, maxResults),
        truncated: matches.length >= maxResults,
        totalMatches: matches.length,
      };
    } catch (err: any) {
      // grep returns exit code 1 when no matches found
      if (err.status === 1) {
        return { matches: [], truncated: false, totalMatches: 0 };
      }
      throw err;
    }
  }

  private glob(pattern: string, directory: string, options: GlobOptions): GlobResult {
    const dir = this.validatePath(directory);
    const maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS;
    const excludes = options.excludes ?? DEFAULT_EXCLUDES;

    const excludeFlags = excludes.map(d => `! -path "*/${d}/*"`).join(' ');
    const cmd = `find ${this.shellEscape(dir)} -type f -name ${this.shellEscape(pattern)} ${excludeFlags} | head -n ${maxResults + 1}`;

    try {
      const stdout = execSync(cmd, {
        timeout: SEARCH_TIMEOUT_MS,
        maxBuffer: SEARCH_MAX_BUFFER,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const files = stdout.trim().split('\n').filter(Boolean);
      const truncated = files.length > maxResults;
      const result = truncated ? files.slice(0, maxResults) : files;

      return {
        files: result,
        truncated,
        totalFiles: files.length,
      };
    } catch {
      return { files: [], truncated: false, totalFiles: 0 };
    }
  }

  private hasRipgrep(): boolean {
    try {
      execSync('rg --version', { stdio: 'pipe', timeout: 2000 });
      return true;
    } catch {
      return false;
    }
  }

  private shellEscape(s: string): string {
    return `'${s.replace(/'/g, `'\\''`)}'`;
  }
}
