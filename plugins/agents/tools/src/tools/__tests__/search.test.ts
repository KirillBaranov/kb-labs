import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import {
  createGlobSearchTool,
  createGrepSearchTool,
  createFindDefinitionTool,
  createCodeStatsTool,
} from '../search/search.js';
import type { ToolContext } from '../../types.js';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn(() => true),
    statSync: vi.fn(() => ({ isDirectory: () => true })),
    readdirSync: vi.fn(() => []),
  };
});

const mockExecSync = vi.mocked(execSync);
const mockExistsSync = vi.mocked(fs.existsSync);
const mockStatSync = vi.mocked(fs.statSync);
const mockReaddirSync = vi.mocked(fs.readdirSync);

function ctx(workingDir = '/test/project'): ToolContext {
  return { workingDir };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: directory exists
  mockExistsSync.mockReturnValue(true);
  mockStatSync.mockReturnValue({ isDirectory: () => true } as any);
  mockReaddirSync.mockReturnValue([]);
});

// ─── validateDirectory (shared across tools) ─────────────────

describe('directory validation', () => {
  it('should return error when directory does not exist (glob_search)', async () => {
    mockExistsSync.mockReturnValue(false);
    mockReaddirSync.mockReturnValue([
      { name: 'src', isDirectory: () => true, isFile: () => false },
      { name: 'packages', isDirectory: () => true, isFile: () => false },
    ] as any);
    const tool = createGlobSearchTool(ctx());

    const result = await tool.executor({ pattern: '*.ts', directory: 'agent-tools' });

    expect(result.success).toBe(true);
    expect(result.output).toContain('Directory "agent-tools" not found');
    expect(result.output).toContain('Use "." to search from project root');
    expect(result.output).toContain('Available directories: packages, src');
  });

  it('should return error when directory does not exist (grep_search)', async () => {
    mockExistsSync.mockReturnValue(false);
    const tool = createGrepSearchTool(ctx());

    const result = await tool.executor({ pattern: 'Foo', directory: 'nonexistent' });

    expect(result.success).toBe(true);
    expect(result.output).toContain('Directory "nonexistent" not found');
  });

  it('should return error when directory does not exist (find_definition)', async () => {
    mockExistsSync.mockReturnValue(false);
    const tool = createFindDefinitionTool(ctx());

    const result = await tool.executor({ name: 'MyClass', directory: 'bad-dir' });

    expect(result.success).toBe(true);
    expect(result.output).toContain('Directory "bad-dir" not found');
  });

  it('should return error when directory does not exist (code_stats)', async () => {
    mockExistsSync.mockReturnValue(false);
    const tool = createCodeStatsTool(ctx());

    const result = await tool.executor({ directory: 'missing' });

    expect(result.success).toBe(true);
    expect(result.output).toContain('Directory "missing" not found');
  });

  it('should show resolved path in error', async () => {
    mockExistsSync.mockReturnValue(false);
    const tool = createGlobSearchTool(ctx('/root'));

    const result = await tool.executor({ pattern: '*.ts', directory: 'agent-tools' });

    expect(result.output).toContain('/root/agent-tools');
  });

  it('should filter hidden dirs and node_modules from hints', async () => {
    mockExistsSync.mockReturnValue(false);
    mockReaddirSync.mockReturnValue([
      { name: '.git', isDirectory: () => true, isFile: () => false },
      { name: '.kb', isDirectory: () => true, isFile: () => false },
      { name: 'node_modules', isDirectory: () => true, isFile: () => false },
      { name: 'src', isDirectory: () => true, isFile: () => false },
      { name: 'README.md', isDirectory: () => false, isFile: () => true },
    ] as any);
    const tool = createGlobSearchTool(ctx());

    const result = await tool.executor({ pattern: '*.ts', directory: 'bad' });

    expect(result.output).toContain('src');
    expect(result.output).not.toContain('.git');
    expect(result.output).not.toContain('node_modules');
    expect(result.output).not.toContain('README.md');
  });

  it('should not validate when directory is "."', async () => {
    mockExecSync.mockReturnValue('');
    const tool = createGlobSearchTool(ctx());

    await tool.executor({ pattern: '*.ts' });

    // Should have called execSync (directory validation passed)
    expect(mockExecSync).toHaveBeenCalled();
  });
});

// ─── glob_search ───────────────────────────────────────────

describe('glob_search', () => {
  it('should return found files', async () => {
    mockExecSync.mockReturnValue('/test/project/src/foo.ts\n/test/project/src/bar.ts\n');
    const tool = createGlobSearchTool(ctx());

    const result = await tool.executor({ pattern: '*.ts' });

    expect(result.success).toBe(true);
    expect(result.output).toContain('Found 2 file(s)');
    expect(result.output).toContain('src/foo.ts');
    expect(result.output).toContain('src/bar.ts');
  });

  it('should return "No files found" with hint on empty output', async () => {
    mockExecSync.mockReturnValue('\n');
    const tool = createGlobSearchTool(ctx());

    const result = await tool.executor({ pattern: '*.xyz' });

    expect(result.success).toBe(true);
    expect(result.output).toContain('No files found');
    expect(result.output).toContain('glob_search matches filenames only');
    expect(result.output).toContain('grep_search');
    expect(result.output).toContain('find_definition');
  });

  it('should handle timeout', async () => {
    const err = new Error('timed out');
    (err as any).killed = true;
    mockExecSync.mockImplementation(() => { throw err; });
    const tool = createGlobSearchTool(ctx());

    const result = await tool.executor({ pattern: '*.ts' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('timed out');
  });

  it('should handle general errors', async () => {
    mockExecSync.mockImplementation(() => { throw new Error('permission denied'); });
    const tool = createGlobSearchTool(ctx());

    const result = await tool.executor({ pattern: '*.ts' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('permission denied');
  });

  it('should include default excludes in command', async () => {
    mockExecSync.mockReturnValue('');
    const tool = createGlobSearchTool(ctx());

    await tool.executor({ pattern: '*.ts' });

    const cmd = mockExecSync.mock.calls[0]![0] as string;
    expect(cmd).toContain('node_modules');
    expect(cmd).toContain('dist');
    expect(cmd).toContain('.git');
  });

  it('should use custom excludes when provided', async () => {
    mockExecSync.mockReturnValue('');
    const tool = createGlobSearchTool(ctx());

    await tool.executor({ pattern: '*.ts', exclude: ['custom_dir'] });

    const cmd = mockExecSync.mock.calls[0]![0] as string;
    // custom excludes are merged with defaults
    expect(cmd).toContain('custom_dir');
    expect(cmd).toContain('node_modules');
  });

  it('should search everywhere with empty exclude', async () => {
    mockExecSync.mockReturnValue('');
    const tool = createGlobSearchTool(ctx());

    await tool.executor({ pattern: '*.ts', exclude: [] });

    const cmd = mockExecSync.mock.calls[0]![0] as string;
    // empty excludes array falls back to defaults
    expect(cmd).toContain('node_modules');
  });

  it('should resolve directory relative to workingDir', async () => {
    mockExecSync.mockReturnValue('');
    const tool = createGlobSearchTool(ctx('/root'));

    await tool.executor({ pattern: '*.ts', directory: 'sub/dir' });

    const cmd = mockExecSync.mock.calls[0]![0] as string;
    expect(cmd).toContain('/root/sub/dir');
  });
});

// ─── grep_search ───────────────────────────────────────────

describe('grep_search', () => {
  it('should return matches with file paths and lines', async () => {
    mockExecSync.mockReturnValue(
      '/test/project/src/app.ts:10:import { Foo } from "./foo";\n' +
      '/test/project/src/bar.ts:5:const x = Foo;\n',
    );
    const tool = createGrepSearchTool(ctx());

    const result = await tool.executor({ pattern: 'Foo' });

    expect(result.success).toBe(true);
    expect(result.output).toContain('Found 2 match(es)');
    expect(result.output).toContain('src/app.ts:10');
    expect(result.output).toContain('src/bar.ts:5');
  });

  it('should treat exit code 1 as no matches (not error)', async () => {
    const err = new Error('');
    (err as any).status = 1;
    mockExecSync.mockImplementation(() => { throw err; });
    const tool = createGrepSearchTool(ctx());

    const result = await tool.executor({ pattern: 'nonexistent' });

    expect(result.success).toBe(true);
    expect(result.output).toContain('No matches found');
  });

  it('should suggest filePattern when no matches and no filePattern', async () => {
    const err = new Error('');
    (err as any).status = 1;
    mockExecSync.mockImplementation(() => { throw err; });
    const tool = createGrepSearchTool(ctx());

    const result = await tool.executor({ pattern: 'nonexistent' });

    expect(result.output).toContain('Try adding filePattern');
  });

  it('should not suggest filePattern when filePattern already provided', async () => {
    const err = new Error('');
    (err as any).status = 1;
    mockExecSync.mockImplementation(() => { throw err; });
    const tool = createGrepSearchTool(ctx());

    const result = await tool.executor({ pattern: 'nonexistent', filePattern: '*.ts' });

    expect(result.output).not.toContain('Try adding filePattern');
  });

  it('should handle timeout', async () => {
    const err = new Error('timed out');
    (err as any).killed = true;
    mockExecSync.mockImplementation(() => { throw err; });
    const tool = createGrepSearchTool(ctx());

    const result = await tool.executor({ pattern: 'foo' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('timed out');
  });

  it('should add --include when filePattern provided', async () => {
    mockExecSync.mockReturnValue('');
    const tool = createGrepSearchTool(ctx());

    await tool.executor({ pattern: 'foo', filePattern: '*.ts' });

    const cmd = mockExecSync.mock.calls[0]![0] as string;
    expect(cmd).toContain("--include='*.ts'");
  });

  it('should support pagination via offset/limit', async () => {
    mockExecSync.mockReturnValue(
      '/test/project/src/a.ts:1:Foo\n' +
      '/test/project/src/b.ts:2:Foo\n' +
      '/test/project/src/c.ts:3:Foo\n',
    );
    const tool = createGrepSearchTool(ctx());

    const result = await tool.executor({ pattern: 'Foo', offset: 1, limit: 1 });

    expect(result.success).toBe(true);
    expect(result.output).toContain('showing 1, offset=1, limit=1');
    expect(result.output).toContain('src/b.ts:2');
    expect((result.metadata as any)?.nextOffset).toBe(2);
  });

  it('should fallback to literal mode for invalid regex in auto mode', async () => {
    const regexError = new Error('grep failed');
    (regexError as any).status = 2;
    (regexError as any).stderr = 'grep: parentheses not balanced';
    mockExecSync
      .mockImplementationOnce(() => { throw regexError; })
      .mockImplementationOnce(() => '/test/project/src/a.ts:1:useLLM(\n');

    const tool = createGrepSearchTool(ctx());
    const result = await tool.executor({ pattern: 'useLLM\\(' });

    expect(result.success).toBe(true);
    expect(result.output).toContain('literal fallback');
    expect((result.metadata as any)?.modeUsed).toBe('literal');
  });

  it('should include default excludes', async () => {
    mockExecSync.mockReturnValue('');
    const tool = createGrepSearchTool(ctx());

    await tool.executor({ pattern: 'foo' });

    const cmd = mockExecSync.mock.calls[0]![0] as string;
    expect(cmd).toContain("--exclude-dir='node_modules'");
    expect(cmd).toContain("--exclude-dir='dist'");
  });

  it('should use custom excludes', async () => {
    mockExecSync.mockReturnValue('');
    const tool = createGrepSearchTool(ctx());

    await tool.executor({ pattern: 'foo', exclude: ['vendor'] });

    const cmd = mockExecSync.mock.calls[0]![0] as string;
    // custom excludes are merged with defaults
    expect(cmd).toContain("--exclude-dir='vendor'");
    expect(cmd).toContain("--exclude-dir='node_modules'");
  });

  it('should return "No matches" with hint on empty output', async () => {
    mockExecSync.mockReturnValue('\n');
    const tool = createGrepSearchTool(ctx());

    const result = await tool.executor({ pattern: 'foo' });

    expect(result.success).toBe(true);
    expect(result.output).toContain('No matches found');
    expect(result.output).toContain('Try adding filePattern');
  });
});

// ─── find_definition ───────────────────────────────────────

describe('find_definition', () => {
  it('should find class definition', async () => {
    mockExecSync.mockReturnValue(
      '/test/project/src/registry.ts:7:export class ToolRegistry {\n',
    );
    const tool = createFindDefinitionTool(ctx());

    const result = await tool.executor({ name: 'ToolRegistry' });

    expect(result.success).toBe(true);
    expect(result.output).toContain('Found definition(s) for "ToolRegistry"');
    expect(result.output).toContain('src/registry.ts:7');
  });

  it('should return "No definition found" with hints on exit code 1', async () => {
    const err = new Error('');
    (err as any).status = 1;
    mockExecSync.mockImplementation(() => { throw err; });
    const tool = createFindDefinitionTool(ctx());

    const result = await tool.executor({ name: 'NonExistent' });

    expect(result.success).toBe(true);
    expect(result.output).toContain('No definition found');
    expect(result.output).toContain('grep_search');
    expect(result.output).toContain('glob_search');
    expect(result.output).toContain('*nonexistent*');
  });

  it('should handle timeout', async () => {
    const err = new Error('timed out');
    (err as any).killed = true;
    mockExecSync.mockImplementation(() => { throw err; });
    const tool = createFindDefinitionTool(ctx());

    const result = await tool.executor({ name: 'Foo' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('timed out');
  });

  it('should use custom filePattern', async () => {
    mockExecSync.mockReturnValue('');
    const tool = createFindDefinitionTool(ctx());

    await tool.executor({ name: 'Foo', filePattern: '*.py' });

    const cmd = mockExecSync.mock.calls[0]![0] as string;
    expect(cmd).toContain("--include='*.py'");
    // Should NOT have default includes when custom is specified
    expect(cmd).not.toContain("--include='*.ts'");
  });

  it('should search with language-agnostic patterns', async () => {
    mockExecSync.mockReturnValue('');
    const tool = createFindDefinitionTool(ctx());

    await tool.executor({ name: 'MyClass' });

    const cmd = mockExecSync.mock.calls[0]![0] as string;
    // Should include patterns for multiple languages
    expect(cmd).toContain('class MyClass');
    expect(cmd).toContain('interface MyClass');
    expect(cmd).toContain('function MyClass');
    expect(cmd).toContain('def MyClass');
    expect(cmd).toContain('fn MyClass');
  });

  it('should include default excludes', async () => {
    mockExecSync.mockReturnValue('');
    const tool = createFindDefinitionTool(ctx());

    await tool.executor({ name: 'Foo' });

    const cmd = mockExecSync.mock.calls[0]![0] as string;
    expect(cmd).toContain("--exclude-dir='node_modules'");
    expect(cmd).toContain("--exclude-dir='dist'");
  });

  it('should show directory name in "no definition" message', async () => {
    const err = new Error('');
    (err as any).status = 1;
    mockExecSync.mockImplementation(() => { throw err; });
    const tool = createFindDefinitionTool(ctx());

    const result = await tool.executor({ name: 'Foo', directory: 'src' });

    expect(result.output).toContain('in src');
  });

  it('should show "project root" when directory is default', async () => {
    const err = new Error('');
    (err as any).status = 1;
    mockExecSync.mockImplementation(() => { throw err; });
    const tool = createFindDefinitionTool(ctx());

    const result = await tool.executor({ name: 'Foo' });

    expect(result.output).toContain('in project root');
  });
});

// ─── code_stats ────────────────────────────────────────────

describe('code_stats', () => {
  it('should return stats from three execSync calls', async () => {
    mockExecSync
      .mockReturnValueOnce('  15432 total')       // total lines
      .mockReturnValueOnce('  80 ts\n  20 tsx\n')  // by extension
      .mockReturnValueOnce('100');                  // file count

    const tool = createCodeStatsTool(ctx());
    const result = await tool.executor({});

    expect(result.success).toBe(true);
    expect(result.output).toContain('15432 total');
    expect(result.output).toContain('100');
    expect(result.output).toContain('80 ts');
  });

  it('should pass custom extensions to command', async () => {
    mockExecSync
      .mockReturnValueOnce('0 total')
      .mockReturnValueOnce('')
      .mockReturnValueOnce('0');

    const tool = createCodeStatsTool(ctx());
    await tool.executor({ extensions: 'py,rs' });

    const cmd = mockExecSync.mock.calls[0]![0] as string;
    expect(cmd).toContain("'*.py'");
    expect(cmd).toContain("'*.rs'");
    // Should not have default extensions
    expect(cmd).not.toContain("'*.ts'");
  });

  it('should handle errors', async () => {
    mockExecSync.mockImplementation(() => { throw new Error('disk error'); });
    const tool = createCodeStatsTool(ctx());

    const result = await tool.executor({});

    expect(result.success).toBe(false);
    expect(result.error).toContain('disk error');
  });
});

// ─── Shell injection safety (H7) ───────────────────────────
// All user-supplied values must be single-quoted in shell commands,
// neutralising $(), backtick, and other metacharacters.

describe('shell injection safety', () => {
  const INJECTION = '$(id)';
  const BACKTICK_INJECTION = '`id`';

  describe('glob_search — pattern injection', () => {
    it('single-quotes the pattern so $() is not executed', async () => {
      mockExecSync.mockReturnValue('');
      const tool = createGlobSearchTool(ctx());

      await tool.executor({ pattern: INJECTION });

      const cmd = mockExecSync.mock.calls[0]![0] as string;
      // The raw $() must appear inside single-quotes, never bare
      expect(cmd).toContain(`'${INJECTION}'`);
      expect(cmd).not.toMatch(/[^']\$\(id\)/); // no unquoted $()
    });

    it('single-quotes the pattern so backticks are not executed', async () => {
      mockExecSync.mockReturnValue('');
      const tool = createGlobSearchTool(ctx());

      await tool.executor({ pattern: BACKTICK_INJECTION });

      const cmd = mockExecSync.mock.calls[0]![0] as string;
      expect(cmd).toContain(`'${BACKTICK_INJECTION}'`);
    });

    it('single-quotes the directory / fullPath', async () => {
      mockExecSync.mockReturnValue('');
      const tool = createGlobSearchTool(ctx('/proj/$(id)'));

      await tool.executor({ pattern: '*.ts' });

      const cmd = mockExecSync.mock.calls[0]![0] as string;
      expect(cmd).toContain("'/proj/$(id)'");
    });

    it('single-quotes user-supplied excludes', async () => {
      mockExecSync.mockReturnValue('');
      const tool = createGlobSearchTool(ctx());

      await tool.executor({ pattern: '*.ts', exclude: ['$(evil)'] });

      const cmd = mockExecSync.mock.calls[0]![0] as string;
      expect(cmd).toContain("'*/$(evil)/*'");
    });
  });

  describe('grep_search — filePattern injection', () => {
    it('single-quotes filePattern so $() is not executed', async () => {
      mockExecSync.mockReturnValue('');
      const tool = createGrepSearchTool(ctx());

      await tool.executor({ pattern: 'foo', filePattern: `*.ts $(id)` });

      const cmd = mockExecSync.mock.calls[0]![0] as string;
      expect(cmd).toContain(`--include='*.ts $(id)'`);
    });

    it('single-quotes user-supplied excludes', async () => {
      mockExecSync.mockReturnValue('');
      const tool = createGrepSearchTool(ctx());

      await tool.executor({ pattern: 'foo', exclude: ['$(evil)'] });

      const cmd = mockExecSync.mock.calls[0]![0] as string;
      expect(cmd).toContain("--exclude-dir='$(evil)'");
    });
  });

  describe('find_definition — name and filePattern injection', () => {
    it('single-quotes the entire grep -E pattern (neutralises name injection)', async () => {
      mockExecSync.mockReturnValue('');
      const tool = createFindDefinitionTool(ctx());

      await tool.executor({ name: `Foo" $(id)` });

      const cmd = mockExecSync.mock.calls[0]![0] as string;
      // The whole pattern is inside single-quotes — " and $() can't escape
      // Single-quote wraps the full expression starting with (
      expect(cmd).toMatch(/grep -rn -E '\(.*Foo"/);
    });

    it('single-quotes filePattern so $() is not executed', async () => {
      mockExecSync.mockReturnValue('');
      const tool = createFindDefinitionTool(ctx());

      await tool.executor({ name: 'Foo', filePattern: `*.py $(id)` });

      const cmd = mockExecSync.mock.calls[0]![0] as string;
      expect(cmd).toContain(`--include='*.py $(id)'`);
    });
  });

  describe('code_stats — extensions injection', () => {
    it('single-quotes extension wildcards so $() is not executed', async () => {
      mockExecSync
        .mockReturnValueOnce('0 total')
        .mockReturnValueOnce('')
        .mockReturnValueOnce('0');
      const tool = createCodeStatsTool(ctx());

      await tool.executor({ extensions: `ts,$(id)` });

      const cmd = mockExecSync.mock.calls[0]![0] as string;
      // The extension wildcard is single-quoted
      expect(cmd).toContain(`'*.$(id)'`);
    });
  });
});
