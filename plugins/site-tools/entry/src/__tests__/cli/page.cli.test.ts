import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/sdk/testing';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(() => '{}'),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
}));

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import pageCommand from '../../commands/page.js';

interface PageFlags {
  badge?: string;
  'dry-run'?: boolean;
}

const CWD = '/workspace';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(readFileSync).mockReturnValue('{}');
  vi.mocked(existsSync).mockReturnValue(false);
});

describe('site-tools:page', () => {
  it('PAGE-01: missing segment → error and exitCode 1', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: CWD });

    const result = await pageCommand.execute(ctx as never, mockCLIInput<PageFlags>({ argv: [] }));

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it('PAGE-02: page.tsx already exists → error and exitCode 1', async () => {
    vi.mocked(existsSync).mockReturnValue(true);

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: CWD });

    const result = await pageCommand.execute(ctx as never, mockCLIInput<PageFlags>({ argv: ['pricing'] }));

    expect(result.ok).toBe(false);
    expect(captured.errors[0]).toContain('pricing');
    expect(mkdirSync).not.toHaveBeenCalled();
  });

  it('PAGE-03: happy path creates page.tsx, opengraph-image.tsx, and updates both message files', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: CWD });

    const result = await pageCommand.execute(ctx as never, mockCLIInput<PageFlags>({ argv: ['pricing'] }));

    expect(result.ok).toBe(true);
    expect(mkdirSync).toHaveBeenCalledOnce();
    // page.tsx, opengraph-image.tsx, en.json, ru.json
    expect(writeFileSync).toHaveBeenCalledTimes(4);

    const [pagePath, pageContent] = vi.mocked(writeFileSync).mock.calls[0] as [string, string];
    expect(pagePath).toContain('pricing/page.tsx');
    expect(pageContent).toContain('imageSegment:');
    expect(pageContent).toContain("imageSegment: 'pricing'");

    const [ogPath, ogContent] = vi.mocked(writeFileSync).mock.calls[1] as [string, string];
    expect(ogPath).toContain('pricing/opengraph-image.tsx');
    expect(ogContent).toContain('renderOgImage');

    expect(captured.success.length).toBeGreaterThan(0);
  });

  it('PAGE-04: --dry-run → no files written, output prefixed with dry-run', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: CWD });

    const result = await pageCommand.execute(
      ctx as never,
      mockCLIInput<PageFlags>({ argv: ['pricing'], flags: { 'dry-run': true } }),
    );

    expect(result.ok).toBe(true);
    expect(mkdirSync).not.toHaveBeenCalled();
    expect(writeFileSync).not.toHaveBeenCalled();
    expect(captured.success[0]?.message).toContain('dry-run');
  });

  it('PAGE-05: --badge flag is embedded in opengraph-image.tsx content', async () => {
    const { ui } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: CWD });

    await pageCommand.execute(
      ctx as never,
      mockCLIInput<PageFlags>({ argv: ['solutions/my-sol'], flags: { badge: 'Solutions' } }),
    );

    const [, ogContent] = vi.mocked(writeFileSync).mock.calls[1] as [string, string];
    expect(ogContent).toContain("badge: 'Solutions'");
  });

  it('PAGE-02b: opengraph-image.tsx already exists → error and exitCode 1', async () => {
    vi.mocked(existsSync).mockImplementation((p) => String(p).endsWith('opengraph-image.tsx'));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: CWD });

    const result = await pageCommand.execute(ctx as never, mockCLIInput<PageFlags>({ argv: ['pricing'] }));

    expect(result.ok).toBe(false);
    expect(captured.errors[0]).toContain('opengraph-image.tsx');
    expect(mkdirSync).not.toHaveBeenCalled();
  });

  it('PAGE-SEC: path traversal segment rejected with exitCode 1', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: CWD });

    const result = await pageCommand.execute(
      ctx as never,
      mockCLIInput<PageFlags>({ argv: ['../../../etc/passwd'] }),
    );

    expect(result.ok).toBe(false);
    expect(captured.errors[0]).toContain('Invalid segment');
    expect(mkdirSync).not.toHaveBeenCalled();
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it('PAGE-SEC: segment with uppercase rejected', async () => {
    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: CWD });

    const result = await pageCommand.execute(
      ctx as never,
      mockCLIInput<PageFlags>({ argv: ['My-Page'] }),
    );

    expect(result.ok).toBe(false);
    expect(captured.errors[0]).toContain('Invalid segment');
  });

  it('PAGE-06: nested segment produces camelCase namespace in messages', async () => {
    const { ui } = createCapturedUI();
    const ctx = createMockContext({ ui, cwd: CWD });

    await pageCommand.execute(ctx as never, mockCLIInput<PageFlags>({ argv: ['product/kb-dev'] }));

    // JSON files are written with dotSet — verify en.json write contains the key
    const enCall = vi.mocked(writeFileSync).mock.calls[2] as [string, string];
    expect(enCall[0]).toContain('en.json');
    const written = JSON.parse(enCall[1] as string) as Record<string, unknown>;
    expect((written as Record<string, Record<string, Record<string, string>>>)['productKbDev']?.['meta']?.['title']).toContain('TODO');
  });
});
